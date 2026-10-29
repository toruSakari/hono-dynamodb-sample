// 入力の形式は正しくても、現在の集約状態では許可されない操作。
export class DomainRuleError extends Error {}
export class InvalidCurrentPasswordError extends DomainRuleError {}
