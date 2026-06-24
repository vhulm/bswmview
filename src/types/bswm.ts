// ============================================================
// BswM 数据模型类型定义 — 通用范式
//
// 设计原则:
//   1. 所有 AUTOSAR EcuC 容器统一为 BswMEntity，零信息丢失
//   2. 参数/引用通过 Map 自动提取，key 为 DEFINITION-REF 最后一段
//   3. refs 仅存储容器自身的直接引用，不包含子容器引用
//   4. 子容器中的引用通过递归遍历 subContainers 获取（由图模块负责）
//   5. 层级分类由 ENTITY_LAYER_MAP 声明式配置，不由类型硬编码
//   6. 特殊边语义（如 Rule True/False）由 SPECIAL_EDGES 配置
// ============================================================

/** 通用 BswM 实体 — 对应 ARXML 中的一个 ECUC-CONTAINER-VALUE */
export interface BswMEntity {
  name: string
  path: string
  /**
   * 实体类型名 — DEFINITION-REF 路径的最后一段
   * 如 'BswMModeRequestPort'、'BswMRule'、'BswMActionListItem'
   * 用作 ENTITY_LAYER_MAP 的 key 进行层级分类
   */
  type: string
  /**
   * 容器自身的所有参数: 参数定义名 → 值
   * key 为 DEFINITION-REF 最后一段，如 'BswMRequestProcessing'
   * value 为原始字符串值，如 'BSWM_IMMEDIATE'、'false'、'0.01'
   */
  params: Map<string, string>
  /**
   * 容器自身的所有引用: 引用定义名 → 目标路径列表
   * key 为 DEFINITION-REF 最后一段，如 'BswMRuleTrueActionList'
   * value 为 VALUE-REF 指向的完整路径列表
   *
   * 注意: 仅包含容器直接 REFERENCE-VALUES 中的引用
   * 子容器中的引用需通过递归遍历 subContainers 获取
   * （如 ActionList → ActionListItem → BswMActionListItemRef）
   */
  refs: Map<string, string[]>
  /**
   * 所有子容器（已解析为 BswMEntity，保留完整嵌套结构）
   * 子容器本身也有 params/refs/subContainers，递归结构完整
   */
  subContainers: BswMEntity[]
}

/** BswM 完整数据模型 */
export interface BswMModel {
  /** 所有实体，以 ARXML 路径为键 */
  entities: Map<string, BswMEntity>
}
