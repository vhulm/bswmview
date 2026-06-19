// ============================================================
// useGraphFilter — 图层过滤 + 链路高亮 + dimmed 标注
//
// 将 BswMGraph.vue 中的 watchEffect 过滤逻辑提取为独立 composable，
// 降低组件复杂度，便于测试和维护。
// ============================================================

import { watchEffect, shallowRef } from 'vue'
import { useBswMStore } from '@/stores/bswm-store'
import type { NodeLayer } from '@/constants/layers'

export function useGraphFilter() {
  const store = useBswMStore()

  // 使用 shallowRef + watchEffect，使 v-model 可写
  const filteredNodes = shallowRef<any[]>([])
  const filteredEdges = shallowRef<any[]>([])

  watchEffect(() => {
    const chainIds = store.focusedChainIds
    const visibility = store.layerVisibility
    const unusedPaths = store.unusedNodePaths

    // 图层过滤 + 高亮/dimmed/unused 标注（单次遍历）
    const visibleNodes = store.nodes.filter((n: any) => {
      const layer = n.data?.layer as NodeLayer | undefined
      return layer ? visibility[layer] : true
    })
    const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id))

    if (!chainIds) {
      filteredNodes.value = visibleNodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          highlighted: false,
          dimmed: false,
          unused: unusedPaths.has(n.id),
        },
      }))
    } else {
      filteredNodes.value = visibleNodes.map((n: any) => {
        const inChain = chainIds.has(n.id)
        return {
          ...n,
          data: {
            ...n.data,
            highlighted: inChain,
            dimmed: !inChain,
            unused: unusedPaths.has(n.id),
          },
        }
      })
    }

    // 边：仅保留两端节点都可见的边
    const visibleEdges = store.edges.filter((e: any) =>
      visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    )

    if (!chainIds) {
      filteredEdges.value = visibleEdges
    } else {
      filteredEdges.value = visibleEdges.map((e: any) => {
        const inChain = chainIds.has(e.source) && chainIds.has(e.target)
        if (inChain) return e
        return { ...e, style: { ...e.style, opacity: 0.15 }, animated: false }
      })
    }
  })

  return { filteredNodes, filteredEdges }
}
