<script setup lang="ts">
import { computed } from 'vue'
import { useBswMStore } from '@/stores/bswm-store'
import { LAYER_COLORS } from '@/types/bswm'
import type { NodeLayer, ModeRequestPort, ModeCondition, LogicalExpression, BswMRule, ActionList, BswMAction, ModeInitValue } from '@/types/bswm'

const store = useBswMStore()

/** 层级颜色映射，复用 LAYER_COLORS；modeInitValue 使用独立颜色 */
const TYPE_COLOR_MAP: Record<string, string> = {
  ...Object.fromEntries(
    (Object.keys(LAYER_COLORS) as NodeLayer[]).map(k => [k, LAYER_COLORS[k].border])
  ),
  modeInitValue: '#607d8b',
}

const TYPE_LABEL_MAP: Record<string, string> = {
  requestPort: '请求端口 (RequestPort)',
  condition: '模式条件 (ModeCondition)',
  expression: '逻辑表达式 (LogicalExpression)',
  rule: '仲裁规则 (BswMRule)',
  actionList: '动作列表 (ActionList)',
  action: '动作 (Action)',
  modeInitValue: '模式初始值 (ModeInitValue)',
}

interface FieldEntry { label: string; value: string }
interface ListSection { label: string; items: string[] }

const entityInfo = computed(() => {
  const entity = store.selectedEntity
  if (!entity || !store.model) return null

  const m = store.model
  const entityType = entity._entityType as string
  const typeColor = TYPE_COLOR_MAP[entityType] ?? '#666'
  const typeLabel = TYPE_LABEL_MAP[entityType] ?? entityType
  const fields: FieldEntry[] = []
  let list: ListSection | undefined

  switch (entityType) {
    case 'requestPort': {
      const port = entity as ModeRequestPort
      fields.push(
        { label: '名称', value: port.name },
        { label: '来源类型', value: port.source.type },
        { label: '引用', value: port.source.reference ?? '-' },
        { label: '请求者ID', value: port.source.requesterId?.toString() ?? '-' },
        { label: '协议端口', value: port.source.protocolPort ?? '-' },
        { label: '处理方式', value: port.processing },
        { label: '路径', value: port.path },
      )
      break
    }
    case 'condition': {
      const cond = entity as ModeCondition
      const portName = m.requestPorts.get(cond.modeRequestPortRef)?.name
        ?? cond.modeRequestPortRef.split('/').pop() ?? '-'
      fields.push(
        { label: '名称', value: cond.name },
        { label: '比较类型', value: cond.conditionType },
        { label: '引用端口', value: portName },
        { label: '比较值', value: cond.compareValue },
        { label: '值类型', value: cond.compareValueType },
        { label: '路径', value: cond.path },
      )
      break
    }
    case 'expression': {
      const expr = entity as LogicalExpression
      const argNames = expr.arguments.map((ref: string) => {
        const cond = m.conditions.get(ref)
        if (cond) return `Cond: ${cond.name}`
        const subExpr = m.expressions.get(ref)
        if (subExpr) return `Expr: ${subExpr.name}`
        return ref.split('/').pop() ?? ref
      })
      fields.push(
        { label: '名称', value: expr.name },
        { label: '操作符', value: expr.operator },
        { label: '参数数量', value: expr.arguments.length.toString() },
        { label: '路径', value: expr.path },
      )
      list = { label: '参数列表', items: argNames }
      break
    }
    case 'rule': {
      const rule = entity as BswMRule
      const exprName = m.expressions.get(rule.expressionRef)?.name
        ?? rule.expressionRef.split('/').pop() ?? '-'
      const trueALName = rule.trueActionListRef
        ? m.actionLists.get(rule.trueActionListRef)?.name ?? '-' : '-'
      const falseALName = rule.falseActionListRef
        ? m.actionLists.get(rule.falseActionListRef)?.name ?? '-' : '-'
      fields.push(
        { label: '名称', value: rule.name },
        { label: '初始状态', value: rule.initState },
        { label: '嵌套执行', value: rule.nestedExecutionOnly ? '是' : '否' },
        { label: '逻辑表达式', value: exprName },
        { label: 'True ActionList', value: trueALName },
        { label: 'False ActionList', value: falseALName },
        { label: '路径', value: rule.path },
      )
      break
    }
    case 'actionList': {
      const al = entity as ActionList
      fields.push(
        { label: '名称', value: al.name },
        { label: '执行模式', value: al.execution },
        { label: '动作项数', value: al.items.length.toString() },
        { label: '路径', value: al.path },
      )
      list = {
        label: '动作项',
        items: al.items.map((item: { index: number; actionRef: string; abortOnFail: boolean }) => {
          const actionName = m.actions.get(item.actionRef)?.name
            ?? m.actionLists.get(item.actionRef)?.name
            ?? item.actionRef.split('/').pop() ?? '-'
          return `#${item.index} ${actionName}${item.abortOnFail ? ' [abort]' : ''}`
        }),
      }
      break
    }
    case 'action': {
      const action = entity as BswMAction
      const detailEntries = Object.entries(action.details)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => {
          // 布尔值格式化：false 语义重要（如 comAllowed=false = DisAllow）
          if (typeof v === 'boolean') return `${k}: ${v ? '是' : '否'}`
          if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`
          return `${k}: ${String(v)}`
        })
      fields.push(
        { label: '名称', value: action.name },
        { label: '动作类型', value: action.type },
        { label: '路径', value: action.path },
      )
      if (detailEntries.length > 0) {
        list = { label: '动作参数', items: detailEntries }
      }
      break
    }
    case 'modeInitValue': {
      const initVal = entity as ModeInitValue
      const valEntries = Object.entries(initVal.values)
      fields.push(
        { label: '名称', value: initVal.name },
        { label: '路径', value: initVal.path },
      )
      if (valEntries.length > 0) {
        list = { label: '初始值', items: valEntries.map(([k, v]) => `${k}: ${v}`) }
      }
      break
    }
  }

  return { type: typeLabel, typeColor, fields, list }
})
</script>

<template>
  <div v-if="entityInfo" class="w-72 h-full bg-white border-l border-gray-200 overflow-y-auto">
    <div class="p-3 border-b border-gray-100 flex items-center justify-between">
      <h3 class="text-sm font-semibold" :style="{ color: entityInfo.typeColor }">
        {{ entityInfo.type }}
      </h3>
      <button @click="store.selectNode(null)" class="text-gray-400 hover:text-gray-600 text-sm cursor-pointer">✕</button>
    </div>

    <div class="p-3 space-y-2">
      <div v-for="field in entityInfo.fields" :key="field.label" class="text-xs">
        <div class="text-gray-500 mb-0.5">{{ field.label }}</div>
        <div class="text-gray-800 font-mono bg-gray-50 rounded px-2 py-1 break-all text-[11px]">
          {{ field.value }}
        </div>
      </div>

      <div v-if="entityInfo.list" class="text-xs mt-2">
        <div class="text-gray-500 mb-1">{{ entityInfo.list.label }}</div>
        <div class="space-y-0.5">
          <div
            v-for="(item, i) in entityInfo.list.items"
            :key="i"
            class="bg-gray-50 text-gray-700 rounded px-2 py-0.5 font-mono text-[11px] break-all"
          >
            {{ item }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
