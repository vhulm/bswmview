// ============================================================
// ARXML 解析器 — 将 AUTOSAR BswM ARXML 解析为 BswMModel
//
// 设计原则:
//   1. 节点 path/id 与 ARXML VALUE-REF 路径一致，引用天然匹配
//   2. 从 AR-PACKAGE SHORT-NAME 动态提取 ECU 前缀，不硬编码
//   3. 递归搜索 AR-PACKAGE 树，兼容嵌套结构
//   4. 支持 BswMPartition 容器
//   5. 未识别的 Action 类型保留原始 DEFINITION-REF 名称，不伪装
// ============================================================

import { XMLParser } from 'fast-xml-parser'
import type {
  BswMModel, BswMGeneral, ModeRequestPort, ModeCondition,
  LogicalExpression, BswMRule, ActionList, BswMAction,
  ModeInitValue, ActionType
} from '@/types/bswm'
import { CONDITION_TYPE_MAP } from '@/types/bswm'

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name: string) => [
    'ECUC-CONTAINER-VALUE',
    'ECUC-NUMERICAL-PARAM-VALUE',
    'ECUC-TEXTUAL-PARAM-VALUE',
    'ECUC-REFERENCE-VALUE',
    'AR-PACKAGE',
  ].includes(name),
  processEntities: false,
  htmlEntities: false,
}

// ---- 工具函数 ----

function getShortName(c: any): string { return c?.['SHORT-NAME'] ?? '' }

function getDefRef(c: any): string {
  return c?.['DEFINITION-REF']?.['#text'] ?? c?.['DEFINITION-REF'] ?? ''
}

/** 从 DEFINITION-REF 路径提取最后一段 */
function defRefLastSegment(defRef: string): string {
  if (!defRef) return ''
  return defRef.split('/').pop() ?? ''
}

/** 在容器的 PARAMETER-VALUES 中查找指定 DEFINITION-REF 后缀的参数值 */
function findParamValue(container: any, defRefSuffix: string): string | undefined {
  const numParams = container?.['PARAMETER-VALUES']?.['ECUC-NUMERICAL-PARAM-VALUE']
  const textParams = container?.['PARAMETER-VALUES']?.['ECUC-TEXTUAL-PARAM-VALUE']
  const all = [
    ...(Array.isArray(numParams) ? numParams : numParams ? [numParams] : []),
    ...(Array.isArray(textParams) ? textParams : textParams ? [textParams] : []),
  ]
  for (const p of all) {
    const defRef = getDefRef(p)
    if (defRef.endsWith(defRefSuffix)) return p?.['VALUE'] ?? undefined
  }
  return undefined
}

/** 在容器的 REFERENCE-VALUES 中查找指定 DEFINITION-REF 后缀的引用值 */
function findRefValue(container: any, defRefSuffix: string): string | undefined {
  const refs = container?.['REFERENCE-VALUES']?.['ECUC-REFERENCE-VALUE']
  if (!refs) return undefined
  const all = Array.isArray(refs) ? refs : [refs]
  for (const r of all) {
    const defRef = getDefRef(r)
    if (defRef.endsWith(defRefSuffix)) {
      return r?.['VALUE-REF']?.['#text'] ?? r?.['VALUE-REF'] ?? undefined
    }
  }
  return undefined
}

/** 在容器的 REFERENCE-VALUES 中查找所有匹配 DEFINITION-REF 后缀的引用值 */
function findAllRefValues(container: any, defRefSuffix: string): string[] {
  const refs = container?.['REFERENCE-VALUES']?.['ECUC-REFERENCE-VALUE']
  if (!refs) return []
  const all = Array.isArray(refs) ? refs : [refs]
  const results: string[] = []
  for (const r of all) {
    const defRef = getDefRef(r)
    if (defRef.endsWith(defRefSuffix)) {
      const val = r?.['VALUE-REF']?.['#text'] ?? r?.['VALUE-REF']
      if (val) results.push(val)
    }
  }
  return results
}

function getSubContainers(container: any): any[] {
  const subs = container?.['SUB-CONTAINERS']?.['ECUC-CONTAINER-VALUE']
  if (!subs) return []
  return Array.isArray(subs) ? subs : [subs]
}

function getContainers(container: any): any[] {
  const subs = container?.['CONTAINERS']?.['ECUC-CONTAINER-VALUE']
  if (!subs) return []
  return Array.isArray(subs) ? subs : [subs]
}

/** 读取布尔参数，缺失时返回默认值 */
function boolParam(container: any, suffix: string, def = false): boolean {
  const val = findParamValue(container, suffix)
  return val !== undefined ? val === 'true' : def
}

// ============================================================
// 主解析函数
// ============================================================

export function parseBswMArxml(xmlContent: string): BswMModel {
  const parser = new XMLParser(PARSER_OPTIONS)
  const parsed = parser.parse(xmlContent)

  // ---- 1. 递归搜索 AR-PACKAGE 树，找到 BswM 模块 ----
  const arPackages = parsed?.['AUTOSAR']?.['AR-PACKAGES']?.['AR-PACKAGE']
  if (!arPackages) throw new Error('无法找到 AR-PACKAGES')

  const { module: bswmModule, ecuPrefix } = findBswmModule(arPackages)
  if (!bswmModule) throw new Error('无法找到 BswM 模块配置（EcuC 格式）。此文件可能是非 EcuC 格式的 ARXML，不支持解析。')

  // ---- 2. 找到 BswMGeneral 和 BswMConfig ----
  const topContainers = getContainers(bswmModule)
  let generalContainer: any = null
  let configContainer: any = null
  for (const c of topContainers) {
    const defRef = getDefRef(c)
    if (defRef.endsWith('BswMGeneral')) generalContainer = c
    if (defRef.endsWith('BswMConfig')) configContainer = c
  }

  const general = parseGeneral(generalContainer)

  // ---- 3. 找到 BswMArbitration 和 BswMModeControl ----
  // 兼容两种结构:
  //   a) BswMConfig 直接包含 BswMArbitration / BswMModeControl
  //   b) BswMConfig 包含 BswMPartition，Partition 内再包含上述容器
  const configSubs = getSubContainers(configContainer)
  const arbitrationContainers: any[] = []
  const modeControlContainers: any[] = []

  for (const c of configSubs) {
    const defRef = getDefRef(c)
    if (defRef.endsWith('BswMArbitration')) {
      arbitrationContainers.push(c)
    } else if (defRef.endsWith('BswMModeControl')) {
      modeControlContainers.push(c)
    } else if (defRef.endsWith('BswMPartition')) {
      // 进入 Partition 内部查找
      for (const pc of getSubContainers(c)) {
        const pcDefRef = getDefRef(pc)
        if (pcDefRef.endsWith('BswMArbitration')) arbitrationContainers.push(pc)
        else if (pcDefRef.endsWith('BswMModeControl')) modeControlContainers.push(pc)
      }
    }
  }

  // 路径前缀: 与 ARXML VALUE-REF 保持一致
  const arbPathPrefix = `${ecuPrefix}/BswM/BswMConfig/BswMArbitration`
  const mcPathPrefix  = `${ecuPrefix}/BswM/BswMConfig/BswMModeControl`

  const requestPorts = new Map<string, ModeRequestPort>()
  const conditions   = new Map<string, ModeCondition>()
  const expressions  = new Map<string, LogicalExpression>()
  const rules        = new Map<string, BswMRule>()
  const actionLists  = new Map<string, ActionList>()
  const actions      = new Map<string, BswMAction>()
  const modeInitValues = new Map<string, ModeInitValue>()

  // ---- 4. 解析所有 BswMArbitration ----
  for (const arbContainer of arbitrationContainers) {
    for (const container of getSubContainers(arbContainer)) {
      const defRef = getDefRef(container)
      const name = getShortName(container)
      const path = `${arbPathPrefix}/${name}`

      if (defRef.endsWith('BswMModeRequestPort')) {
        requestPorts.set(path, parseRequestPort(container, path))
      } else if (defRef.endsWith('BswMModeCondition')) {
        conditions.set(path, parseCondition(container, path))
      } else if (defRef.endsWith('BswMLogicalExpression')) {
        expressions.set(path, parseExpression(container, path))
      } else if (defRef.endsWith('BswMRule')) {
        rules.set(path, parseRule(container, path))
      } else if (defRef.endsWith('BswMModeInitValue')) {
        modeInitValues.set(path, parseModeInitValue(container, path))
      }
    }
  }

  // ---- 5. 解析所有 BswMModeControl ----
  for (const mcContainer of modeControlContainers) {
    for (const container of getSubContainers(mcContainer)) {
      const defRef = getDefRef(container)
      const name = getShortName(container)
      const path = `${mcPathPrefix}/${name}`

      if (defRef.endsWith('BswMAction')) {
        actions.set(path, parseAction(container, path))
      } else if (defRef.endsWith('BswMActionList')) {
        actionLists.set(path, parseActionList(container, path))
      }
    }
  }

  return { general, requestPorts, conditions, expressions, rules, actionLists, actions, modeInitValues }
}

// ============================================================
// 递归搜索 BswM 模块
// ============================================================

/**
 * 递归搜索 AR-PACKAGE 树，找到 SHORT-NAME=BswM 的 ECUC-MODULE-CONFIGURATION-VALUES
 * 返回模块对象和 ECU 路径前缀（如 "/S32K312"）
 */
function findBswmModule(arPackages: any): { module: any; ecuPrefix: string } {
  const packages = Array.isArray(arPackages) ? arPackages : [arPackages]

  for (const pkg of packages) {
    const pkgName = getShortName(pkg)

    // 在当前包的 ELEMENTS 中查找
    const elements = pkg?.['ELEMENTS']?.['ECUC-MODULE-CONFIGURATION-VALUES']
    if (elements) {
      const elems = Array.isArray(elements) ? elements : [elements]
      for (const elem of elems) {
        if (getShortName(elem) === 'BswM') {
          return { module: elem, ecuPrefix: `/${pkgName}` }
        }
      }
    }

    // 递归搜索子包
    const subPackages = pkg?.['AR-PACKAGES']?.['AR-PACKAGE']
    if (subPackages) {
      const result = findBswmModule(subPackages)
      if (result.module) return result
    }
  }

  return { module: null, ecuPrefix: '' }
}

// ============================================================
// 子解析函数
// ============================================================

function parseGeneral(container: any): BswMGeneral {
  return {
    canSMEnabled: boolParam(container, 'BswMCanSMEnabled'),
    comMEnabled: boolParam(container, 'BswMComMEnabled'),
    dcmEnabled: boolParam(container, 'BswMDcmEnabled'),
    ecuMEnabled: boolParam(container, 'BswMEcuMEnabled'),
    nmEnabled: boolParam(container, 'BswMNmEnabled'),
    nvMEnabled: boolParam(container, 'BswMNvMEnabled'),
    genericRequestEnabled: boolParam(container, 'BswMGenericRequestEnabled'),
    mainFunctionPeriod: parseFloat(findParamValue(container, 'BswMMainFunctionPeriod') ?? '0.01'),
    cloneVariableSupport: boolParam(container, 'BswMCloneVariableSupport'),
    devErrorDetect: boolParam(container, 'BswMDevErrorDetect'),
    ethIfEnabled: boolParam(container, 'BswMEthIfEnabled'),
    ethSMEnabled: boolParam(container, 'BswMEthSMEnabled'),
    frSMEnabled: boolParam(container, 'BswMFrSMEnabled'),
    j1939DcmEnabled: boolParam(container, 'BswMJ1939DcmEnabled'),
    j1939NmEnabled: boolParam(container, 'BswMJ1939NmEnabled'),
    linSMEnabled: boolParam(container, 'BswMLinSMEnabled'),
    linTPEnabled: boolParam(container, 'BswMLinTPEnabled'),
    sdControlEnabled: boolParam(container, 'BswMSdControlEnabled'),
    sdEnabled: boolParam(container, 'BswMSdEnabled'),
    versionInfoApi: boolParam(container, 'BswMVersionInfoApi'),
  }
}

function parseRequestPort(container: any, path: string): ModeRequestPort {
  const name = getShortName(container)
  const rawProcessing = findParamValue(container, 'BswMRequestProcessing')?.replace('BSWM_', '')
  const processing: ModeRequestPort['processing'] = rawProcessing === 'DEFERRED' ? 'DEFERRED' : 'IMMEDIATE'

  const source: ModeRequestPort['source'] = { type: 'EcuMIndication' }
  for (const sub of getSubContainers(container)) {
    if (!getDefRef(sub).endsWith('BswMModeRequestSource')) continue
    for (const srcSub of getSubContainers(sub)) {
      const srcDefRef = getDefRef(srcSub)
      if (srcDefRef.endsWith('BswMEcuMIndication')) {
        source.type = 'EcuMIndication'
      } else if (srcDefRef.endsWith('BswMEcuMRUNRequestIndication')) {
        source.type = 'EcuMRUNRequestIndication'
        source.protocolPort = findParamValue(srcSub, 'BswMEcuMRUNRequestProtocolPort')?.replace('BSWM_', '')
      } else if (srcDefRef.endsWith('BswMEcuMWakeupSource')) {
        source.type = 'EcuMWakeupSource'
        source.reference = findRefValue(srcSub, 'BswMEcuMWakeupSrcRef')
      } else if (srcDefRef.endsWith('BswMCanSMIndication')) {
        source.type = 'CanSMIndication'
        source.reference = findRefValue(srcSub, 'BswMCanSMChannelRef')
      } else if (srcDefRef.endsWith('BswMComMIndication')) {
        source.type = 'ComMIndication'
        source.reference = findRefValue(srcSub, 'BswMComMChannelRef')
      } else if (srcDefRef.endsWith('BswMComMPncRequest')) {
        source.type = 'ComMPncRequest'
        source.reference = findRefValue(srcSub, 'BswMComMPncChannelRef')
      } else if (srcDefRef.endsWith('BswMDcmComModeRequest')) {
        source.type = 'DcmComModeRequest'
        source.reference = findRefValue(srcSub, 'BswMDcmComMChannelRef')
      } else if (srcDefRef.endsWith('BswMGenericRequest')) {
        source.type = 'GenericRequest'
        const id = findParamValue(srcSub, 'BswMModeRequesterId')
        source.requesterId = id ? parseInt(id, 10) : undefined
      } else if (srcDefRef.endsWith('BswMTimer')) {
        source.type = 'Timer'
      }
    }
  }

  return { name, path, processing, source }
}

function parseCondition(container: any, path: string): ModeCondition {
  const name = getShortName(container)
  const rawType = findParamValue(container, 'BswMConditionType') ?? 'BSWM_EQUALS'
  const conditionType = CONDITION_TYPE_MAP[rawType] ?? 'EQUALS'
  const modeRequestPortRef = findRefValue(container, 'BswMConditionMode') ?? ''

  let compareValue = ''
  let compareValueType: ModeCondition['compareValueType'] = 'enumeration'

  for (const sub of getSubContainers(container)) {
    if (!getDefRef(sub).endsWith('BswMConditionValue')) continue
    for (const modeSub of getSubContainers(sub)) {
      if (!getDefRef(modeSub).endsWith('BswMBswMode')) continue
      const enumVal = findParamValue(modeSub, 'BswModeCompareValue')
      const strVal = findParamValue(modeSub, 'BswMBswRequestedMode')
      if (enumVal) {
        compareValue = enumVal
        compareValueType = 'enumeration'
      } else if (strVal) {
        compareValue = strVal
        compareValueType = 'string'
      }
    }
  }

  return { name, path, conditionType, modeRequestPortRef, compareValue, compareValueType }
}

function parseExpression(container: any, path: string): LogicalExpression {
  const name = getShortName(container)
  const rawOp = findParamValue(container, 'BswMLogicalOperator')
  const operator = (rawOp?.replace('BSWM_', '') || 'AND') as LogicalExpression['operator']
  const arguments_ = findAllRefValues(container, 'BswMArgumentRef')
  return { name, path, operator, arguments: arguments_ }
}

function parseRule(container: any, path: string): BswMRule {
  const name = getShortName(container)
  const nestedExecutionOnly = findParamValue(container, 'BswMNestedExecutionOnly') === 'true'
  const rawInitState = findParamValue(container, 'BswMRuleInitState')?.replace('BSWM_', '')
  const initState = (rawInitState ?? 'UNDEFINED') as BswMRule['initState']
  const expressionRef = findRefValue(container, 'BswMRuleExpressionRef') ?? ''
  const trueActionListRef = findRefValue(container, 'BswMRuleTrueActionList')
  const falseActionListRef = findRefValue(container, 'BswMRuleFalseActionList')
  return {
    name, path, nestedExecutionOnly, initState,
    expressionRef,
    trueActionListRef: trueActionListRef || undefined,
    falseActionListRef: falseActionListRef || undefined,
  }
}

function parseActionList(container: any, path: string): ActionList {
  const name = getShortName(container)
  const rawExec = findParamValue(container, 'BswMActionListExecution')
  const execution = (rawExec?.replace('BSWM_', '') || 'TRIGGER') as ActionList['execution']
  const items: ActionList['items'] = []
  for (const sub of getSubContainers(container)) {
    if (!getDefRef(sub).endsWith('BswMActionListItem')) continue
    items.push({
      index: parseInt(findParamValue(sub, 'BswMActionListItemIndex') ?? '0', 10),
      abortOnFail: findParamValue(sub, 'BswMAbortOnFail') === 'true',
      actionRef: findRefValue(sub, 'BswMActionListItemRef') ?? '',
    })
  }
  items.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
  return { name, path, execution, items }
}

function parseAction(container: any, path: string): BswMAction {
  const name = getShortName(container)
  const details: BswMAction['details'] = {}
  let actionType: ActionType = 'Unknown'

  for (const sub of getSubContainers(container)) {
    if (!getDefRef(sub).endsWith('BswMAvailableActions')) continue
    for (const availSub of getSubContainers(sub)) {
      const availDefRef = getDefRef(availSub)

      if (availDefRef.endsWith('BswMEcuMDriverInitListBswM')) {
        actionType = 'EcuMDriverInitList'
        details.initListRef = findRefValue(availSub, 'BswMEcuMDriverInitListBswMRef') ?? ''
      } else if (availDefRef.endsWith('BswMEcuMGoDownHaltPoll')) {
        actionType = 'EcuMGoDown'
        details.userIdRef = findRefValue(availSub, 'BswMEcuMUserIdRef') ?? ''
      } else if (availDefRef.endsWith('BswMEcuMSelectShutdownTarget')) {
        actionType = 'EcuMSelectShutdownTarget'
        details.shutdownTarget = findParamValue(availSub, 'BswMEcuMShutdownTarget') ?? ''
        details.sleepModeRef = findRefValue(availSub, 'BswMEcuMSleepModeRef') ?? ''
      } else if (availDefRef.endsWith('BswMEcuMStateSwitch')) {
        actionType = 'EcuMStateSwitch'
        details.ecuMState = findParamValue(availSub, 'BswMEcuMState') ?? ''
      } else if (availDefRef.endsWith('BswMComMAllowCom')) {
        actionType = 'ComMAllowCom'
        details.comAllowed = findParamValue(availSub, 'BswMComAllowed') === 'true'
        details.channelRef = findRefValue(availSub, 'BswMComMAllowChannelRef') ?? ''
      } else if (availDefRef.endsWith('BswMComMModeSwitch')) {
        actionType = 'ComMModeSwitch'
        details.requestedMode = findParamValue(availSub, 'BswMComMRequestedMode') ?? ''
        details.userRef = findRefValue(availSub, 'BswMComMUserRef') ?? ''
      } else if (availDefRef.endsWith('BswMPduGroupSwitch')) {
        actionType = 'PduGroupSwitch'
        details.reinit = findParamValue(availSub, 'BswMPduGroupSwitchReinit') === 'true'
        details.enabledPduGroupRef = findRefValue(availSub, 'BswMEnabledPduGroupRef') ?? ''
        details.disabledPduGroupRef = findRefValue(availSub, 'BswMDisabledPduGroupRef') ?? ''
      } else if (availDefRef.endsWith('BswMDeadlineMonitoringControl')) {
        actionType = 'DeadlineMonitoringControl'
        details.enabledDMPduGroupRef = findRefValue(availSub, 'BswMEnabledDMPduGroupRef') ?? ''
        details.disabledDMPduGroupRef = findRefValue(availSub, 'BswMDisabledDMPduGroupRef') ?? ''
      } else if (availDefRef.endsWith('BswMNMControl')) {
        actionType = 'NMControl'
        details.nmAction = findParamValue(availSub, 'BswMNMAction') ?? ''
        details.networkHandleRef = findRefValue(availSub, 'BswMComMNetworkHandleRef') ?? ''
      } else if (availDefRef.endsWith('BswMUserCallout')) {
        actionType = 'UserCallout'
        details.calloutFunction = findParamValue(availSub, 'BswMUserCalloutFunction') ?? ''
      } else if (availDefRef.endsWith('BswMRteSwitch')) {
        actionType = 'RteSwitch'
        details.rteModeGroupRef = findRefValue(availSub, 'BswMRteModeGroupRef') ?? ''
      } else if (availDefRef.endsWith('BswMSchMModeSwitch')) {
        actionType = 'SchMModeSwitch'
        details.schMModeGroupRef = findRefValue(availSub, 'BswMSchMModeGroupRef') ?? ''
      } else if (availDefRef.endsWith('BswMNvMBlockJobControl')) {
        actionType = 'NvMBlockJobControl'
        details.nvmBlockControl = findParamValue(availSub, 'BswMNvMBlockControl') ?? ''
      } else if (availDefRef.endsWith('BswMPduRouterControl')) {
        actionType = 'PduRouterControl'
        details.pduRouterAction = findParamValue(availSub, 'BswMPduRouterAction') ?? ''
        details.disableInitBuffer = findParamValue(availSub, 'BswMPduRouterDisableInitBuffer') === 'true'
        details.routingPathGroupRef = findRefValue(availSub, 'BswMPduRoutingPathGroupRef') ?? ''
      } else {
        // 未识别的 Action 类型: 保留 DEFINITION-REF 最后一段作为类型名
        const seg = defRefLastSegment(availDefRef)
        if (seg) actionType = seg as ActionType
      }
    }
  }

  return { name, path, type: actionType, details }
}

function parseModeInitValue(container: any, path: string): ModeInitValue {
  const name = getShortName(container)
  const values: Record<string, string> = {}

  // 复用 findParamValue 的数组规范化逻辑提取所有参数
  const numParams = container?.['PARAMETER-VALUES']?.['ECUC-NUMERICAL-PARAM-VALUE']
  const textParams = container?.['PARAMETER-VALUES']?.['ECUC-TEXTUAL-PARAM-VALUE']
  const all = [
    ...(Array.isArray(numParams) ? numParams : numParams ? [numParams] : []),
    ...(Array.isArray(textParams) ? textParams : textParams ? [textParams] : []),
  ]
  for (const p of all) {
    const defRef = getDefRef(p)
    const value = p?.['VALUE']
    if (defRef && value !== undefined) {
      const key = defRefLastSegment(defRef)
      if (key) values[key] = String(value)
    }
  }

  return { name, path, values }
}
