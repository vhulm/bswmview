// ============================================================
// ARXML 解析器 — 通用范式处理器
//
// 设计原则:
//   1. 通用: 所有 ECUC-CONTAINER-VALUE 统一为 BswMEntity，零 if-else 分发
//   2. 完整: 自动提取所有参数和引用，零信息丢失
//   3. 递归: 子容器完整解析保留，深层结构不丢弃
//   4. 声明式: 层级分类由 ENTITY_LAYER_MAP 配置，不由代码逻辑判定
//   5. 路径驱动: 节点 path 与 ARXML VALUE-REF 一致，引用天然匹配
// ============================================================

import { XMLParser } from 'fast-xml-parser'
import type { BswMModel, BswMEntity } from '@/types/bswm'
import { ENTITY_LAYER_MAP } from '@/constants/layers'

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name: string) => [
    'ECUC-CONTAINER-VALUE',
    'ECUC-NUMERICAL-PARAM-VALUE',
    'ECUC-TEXTUAL-PARAM-VALUE',
    'ECUC-REFERENCE-VALUE',
    'ECUC-MODULE-CONFIGURATION-VALUES',
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

/** 从容器的 PARAMETER-VALUES 中提取所有参数对象（数组规范化） */
function getAllParams(container: any): any[] {
  const numParams = container?.['PARAMETER-VALUES']?.['ECUC-NUMERICAL-PARAM-VALUE']
  const textParams = container?.['PARAMETER-VALUES']?.['ECUC-TEXTUAL-PARAM-VALUE']
  return [
    ...(Array.isArray(numParams) ? numParams : numParams ? [numParams] : []),
    ...(Array.isArray(textParams) ? textParams : textParams ? [textParams] : []),
  ]
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

// ============================================================
// 通用容器解析 — 核心函数
// ============================================================

/**
 * 将一个 ECUC-CONTAINER-VALUE 解析为 BswMEntity
 *
 * 自动提取所有参数和引用，递归解析子容器。
 * 不做任何领域判断，零信息丢失。
 */
function parseContainer(container: any, path: string): BswMEntity {
  const name = getShortName(container)
  const type = defRefLastSegment(getDefRef(container))

  // 自动提取所有参数: 参数定义名 → value
  const params = new Map<string, string>()
  for (const p of getAllParams(container)) {
    const key = defRefLastSegment(getDefRef(p))
    const value = p?.['VALUE']
    if (key && value !== undefined) {
      params.set(key, String(value))
    }
  }

  // 自动提取容器自身的所有引用: 引用定义名 → 目标路径列表
  const refs = new Map<string, string[]>()
  const rawRefs = container?.['REFERENCE-VALUES']?.['ECUC-REFERENCE-VALUE']
  if (rawRefs) {
    const all = Array.isArray(rawRefs) ? rawRefs : [rawRefs]
    for (const r of all) {
      const key = defRefLastSegment(getDefRef(r))
      const val = r?.['VALUE-REF']?.['#text'] ?? r?.['VALUE-REF']
      if (key && val) {
        const list = refs.get(key) ?? []
        list.push(val)
        refs.set(key, list)
      }
    }
  }

  // 递归解析子容器
  const subContainers = getSubContainers(container).map(sub => {
    const subName = getShortName(sub)
    return parseContainer(sub, `${path}/${subName}`)
  })

  return { name, path, type, params, refs, subContainers }
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

  // ---- 2. 找到 BswMConfig ----
  const topContainers = getContainers(bswmModule)
  let configContainer: any = null
  for (const c of topContainers) {
    const defRef = getDefRef(c)
    if (defRef.endsWith('BswMConfig')) configContainer = c
  }

  // ---- 3. 找到 BswMArbitration 和 BswMModeControl ----
  // 兼容两种结构:
  //   a) BswMConfig 直接包含 BswMArbitration / BswMModeControl
  //   b) BswMConfig 包含 BswMPartition，Partition 内再包含上述容器
  const configSubs = getSubContainers(configContainer)
  interface ContainerWithPath { container: any; pathPrefix: string }
  const arbitrationContainers: ContainerWithPath[] = []
  const modeControlContainers: ContainerWithPath[] = []

  const baseConfigPath = `${ecuPrefix}/BswM/BswMConfig`

  for (const c of configSubs) {
    const defRef = getDefRef(c)
    if (defRef.endsWith('BswMArbitration')) {
      arbitrationContainers.push({ container: c, pathPrefix: `${baseConfigPath}/BswMArbitration` })
    } else if (defRef.endsWith('BswMModeControl')) {
      modeControlContainers.push({ container: c, pathPrefix: `${baseConfigPath}/BswMModeControl` })
    } else if (defRef.endsWith('BswMPartition')) {
      // 进入 Partition 内部查找，路径前缀包含 Partition 的 SHORT-NAME
      const partitionName = getShortName(c)
      const partitionPrefix = `${baseConfigPath}/${partitionName}`
      for (const pc of getSubContainers(c)) {
        const pcDefRef = getDefRef(pc)
        if (pcDefRef.endsWith('BswMArbitration'))
          arbitrationContainers.push({ container: pc, pathPrefix: `${partitionPrefix}/BswMArbitration` })
        else if (pcDefRef.endsWith('BswMModeControl'))
          modeControlContainers.push({ container: pc, pathPrefix: `${partitionPrefix}/BswMModeControl` })
      }
    }
  }

  // ---- 4. 解析实体 — 仅处理 ENTITY_LAYER_MAP 中定义的 6 种核心类型 ----
  const entities = new Map<string, BswMEntity>()

  for (const { container: arbContainer, pathPrefix: arbPathPrefix } of arbitrationContainers) {
    for (const sub of getSubContainers(arbContainer)) {
      const defRef = getDefRef(sub)
      if (!Object.prototype.hasOwnProperty.call(ENTITY_LAYER_MAP, defRefLastSegment(defRef))) continue
      const name = getShortName(sub)
      const path = `${arbPathPrefix}/${name}`
      const entity = parseContainer(sub, path)
      entities.set(entity.path, entity)
    }
  }

  for (const { container: mcContainer, pathPrefix: mcPathPrefix } of modeControlContainers) {
    for (const sub of getSubContainers(mcContainer)) {
      const defRef = getDefRef(sub)
      if (!Object.prototype.hasOwnProperty.call(ENTITY_LAYER_MAP, defRefLastSegment(defRef))) continue
      const name = getShortName(sub)
      const path = `${mcPathPrefix}/${name}`
      const entity = parseContainer(sub, path)
      entities.set(entity.path, entity)
    }
  }

  return { entities }
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
      for (const elem of elements) {
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

