// Deterministic, read-only local model routing plan. Never executes a model.
export const OLLAMA_URL = 'http://127.0.0.1:11435';
export const ROUTES = Object.freeze({
  daily: Object.freeze({model: 'gemma4:26b-a4b', purpose: 'daily_questions'}),
  architecture: Object.freeze({model: 'gemma4:31b-mlx', purpose: 'complex_reasoning_and_architecture'}),
  coding: Object.freeze({model: 'qwen3.6:27b-coding', purpose: 'code_development'}),
  planning: Object.freeze({model: 'nemotron-3-nano:30b-mlx', purpose: 'task_planning'}),
});
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isRecord = x => isObject(x) && Object.getPrototypeOf(x) === Object.prototype;

// Fail-closed: all model identifiers must be installed and uniquely defined.
export function planModelRoute(task, {provider, installed, resident} = {}) {
  if (!Object.hasOwn(ROUTES, task)) {
    return {status: 'blocked', reason: 'unknown_task_type', task: null, model: null, execution: 'none'};
  }
  const model = ROUTES[task].model;
  const result = {
    status: 'blocked', reason: 'unverified', task, model: `ollama/${model}`,
    purpose: ROUTES[task].purpose, execution: 'none', tools: 'deny-all',
    proposedRuntime: 'isolated_agent_exec', maxActiveContext: 16384,
  };
  if (!isRecord(provider) || provider.api !== 'ollama' ||
      typeof provider.baseUrl !== 'string' ||
      provider.baseUrl.replace(/\/$/, '') !== OLLAMA_URL ||
      !Array.isArray(provider.models)) return {...result, reason: 'provider_not_exact_loopback'};
  const matches = provider.models.filter(row => isRecord(row) && row.id === model);
  if (matches.length !== 1) return {...result, reason: 'model_not_uniquely_registered'};
  if (!Array.isArray(installed) || !installed.includes(model))
    return {...result, reason: 'model_not_installed'};
  if (!Array.isArray(resident) || resident.some(x => !isRecord(x) || typeof x.name !== 'string'))
    return {...result, reason: 'runtime_state_unverified'};
  if (resident.length !== 0) return {...result, reason: 'resident_model_present'};
  return {...result, status: 'ready_for_separate_operator_run', reason: 'fixed_task_route_verified'};
}
