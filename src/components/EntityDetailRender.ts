import { defineComponent, h } from 'vue'
import type { BswMEntity } from '@/types/bswm'

/**
 * 递归实体详情渲染组件
 *
 * 接受 entity，递归渲染 params / refs / subContainers。
 * 使用 render 函数实现，因为 Vue SFC 模板不支持组件自引用递归。
 */
export const EntityDetail = defineComponent({
  name: 'EntityDetail',
  props: {
    entity: { type: Object as () => BswMEntity, required: true },
    getRefTargetName: { type: Function as unknown as () => (path: string) => string, required: true },
  },
  setup(props) {
    return () => {
      const e = props.entity
      const children: ReturnType<typeof h>[] = []

      // ---- 参数 ----
      if (e.params.size > 0) {
        children.push(
          h('div', { class: 'text-[11px] text-gray-500 mb-0.5 mt-1.5 font-medium' }, '参数'),
        )
        for (const [k, v] of e.params) {
          children.push(
            h('div', {
              class: 'bg-gray-50 text-gray-700 rounded px-2 py-0.5 font-mono text-[11px] break-all',
            }, `${k}: ${v.replace(/^BSWM_/, '')}`),
          )
        }
      }

      // ---- 引用 ----
      if (e.refs.size > 0) {
        children.push(
          h('div', { class: 'text-[11px] text-gray-500 mb-0.5 mt-1.5 font-medium' }, '引用'),
        )
        for (const [k, targets] of e.refs) {
          const targetNames = targets.map(t => props.getRefTargetName(t)).join(', ')
          children.push(
            h('div', {
              class: 'bg-gray-50 text-gray-700 rounded px-2 py-0.5 font-mono text-[11px] break-all',
            }, `${k}: ${targetNames}`),
          )
        }
      }

      // ---- 子容器（递归） ----
      if (e.subContainers.length > 0) {
        children.push(
          h('div', { class: 'text-[11px] text-gray-500 mb-0.5 mt-1.5 font-medium' }, '子容器'),
        )
        for (const sub of e.subContainers) {
          children.push(
            h('div', {
              class: 'border border-gray-100 rounded px-2 py-1.5 mt-1',
            }, [
              h('div', { class: 'text-[11px] font-semibold text-gray-700' },
                `${sub.name} (${sub.type})`),
              h(EntityDetail, {
                entity: sub,
                getRefTargetName: props.getRefTargetName,
              }),
            ]),
          )
        }
      }

      return h('div', { class: 'space-y-0.5' }, children)
    }
  },
})
