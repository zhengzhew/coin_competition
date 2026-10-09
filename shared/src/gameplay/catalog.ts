import { thirdSample } from '../third/samples.js';
import { FUTURE_SCORING_BINDING, FUTURE_SCORE_POLICY } from './scoring/releases.js';
import type { RobotScenario } from './robot/runtime.js';

export interface ComponentRef { id: string; version: string }
export interface DemoManifest<Configuration = unknown> {
  id: string; title: string; summary: string; topic: string; tags: string[];
  renderer: string; form: string; modes: string[]; status: 'sample' | 'ready' | 'planned';
  contentVersion: string; dependencies: ComponentRef[]; configuration: Configuration;
  rules: { goal: string; operation: string; success: string; failure: string; scoring: string; boundaries: string[] };
  technology: { parameters: string[]; inputs: string; outputs: string; limitations: string[]; example: string; exportNote?: string };
}
export interface ComponentManifest {
  id: string; name: string; version: string; status: 'development' | 'released';
  description: string; source: string; contract: string; limitations: string[];
}
export const gameplayComponents: ComponentManifest[] = [
  { id: 'robot-runtime', name: '机器人运行控制', version: 'development', status: 'development',
    description: '统一手动与程序控制，组合棋盘规则或连续物理，支持精准定位、按距离或时间移动，管理运行、停止和重置。',
    source: 'shared/src/gameplay/robot/runtime.ts', contract: 'createRobotRuntime(scenario, mode) → start / press / release / tick / snapshot / stop / reset / dispose',
    limitations: ['开发中的组件，尚未冻结正式赛事版本。', '支持收集与摆放；3D 为平面物理，不含抬升、侧翻、堆叠。'] },
  { id: 'city-board', name: '城市棋盘场景', version: 'development', status: 'development',
    description: '展示棋盘、机器人与任务状态，支持视角切换与轻量降级。',
    source: 'client/src/components/CityBoard3D.tsx', contract: 'CityBoard3D({ level, state })',
    limitations: ['只负责呈现，不负责成绩提交。', '地图使用棋盘坐标；与连续物理场景分别适配。'] },
  { id: 'completion-efficiency', name: '完成度与效率计分', version: '1.0.0', status: 'released',
    description: '将任务完成、行动效率、经过核验的代码行数转换为可解释的分项成绩。',
    source: 'shared/src/gameplay/scoring/v1/policy.ts', contract: 'scoreWithRelease(version, evidence, policy?) → 分项得分 / 总分 / 原因',
    limitations: ['DEMO 的核验勾选仅用于演示；正式赛事由服务端核验代码。', '发布源码与指纹固定，修改规则需增加新版本。'] },
  { id: 'map-editor', name: '棋盘地图编辑器', version: 'development', status: 'development',
    description: '复用同一套地图绘制、配置校验、规则试走与 JSON 导入导出能力，制作赛事地图。',
    source: 'client/src/MapEditor.tsx · client/src/map-editor-model.ts', contract: 'MapEditor({ embedded? }) → 本机草稿 / LevelDef JSON；parseMap(input) → LevelDef',
    limitations: ['编辑器与独立入口共用一份本机草稿，未提供云端地图保存。', '只编辑棋盘地图，不编辑连续物理 3D 场地；导出后需显式接入赛事配置。'] },
];
export const competitionComponentBindings = [
  { id: 'future-score', competition: '未来城市', href: '/future/', usage: '正式计分', component: { id: FUTURE_SCORING_BINDING.component, version: FUTURE_SCORING_BINDING.version }, configuration: FUTURE_SCORING_BINDING.configuration },
  { id: 'future-board', competition: '未来城市', href: '/future/', usage: '棋盘呈现', component: { id: 'city-board', version: 'development' }, configuration: 'FL31–FL36' },
  { id: 'farm-runtime', competition: '生态农场', href: '/farm/', usage: '本地试用，未接正式成绩', component: { id: 'robot-runtime', version: 'development' }, configuration: 'farm-1' },
];

export const robotDemoManifests: DemoManifest<RobotScenario>[] = (['collect', 'place'] as const).flatMap(category =>
  (['grid', 'simulation3d'] as const).map(simulation => {
    const { competition_id: _legacy, ...scenario } = thirdSample(category, simulation);
    const grid = simulation === 'grid';
    return {
      id: scenario.demo_id, title: `${category === 'collect' ? '能量收集' : '货物归位'} · ${grid ? '棋盘' : '3D'}`,
      summary: scenario.objective, topic: '机器人', tags: [category === 'collect' ? '收集' : '摆放', ...(grid ? ['路线规划'] : ['连续运动', '精准定位'])],
      renderer: 'robot', form: grid ? '棋盘模拟' : '3D 模拟', modes: ['auto', 'manual'], status: 'sample',
      contentVersion: scenario.content_version, configuration: scenario,
      dependencies: [{ id: 'robot-runtime', version: 'development' }, ...(grid ? [{ id: 'city-board', version: 'development' }] : [])],
      rules: { goal: scenario.objective, operation: '自动：编写指令后运行；手动：WASD 驾驶，摆放任务使用 G/R 操作夹爪。进入关卡后操作方式固定。',
        success: category === 'collect' ? '全部目标各收集一次。' : grid ? '全部货物送入对应目标格。' : '货块完整进入对应区域，脱离夹持并低速停稳 0.4 秒。',
        failure: '程序遇到障碍或超过 120 秒停止，可修改后重试。', scoring: '按完成目标数反馈，不提交正式比赛成绩。',
        boundaries: [grid ? '手动和自动都按整数格移动，转向为 90° 的倍数。' : '货块可推挤与转动；未对准时合拢夹爪可能空夹。', ...(grid ? [] : ['编程支持普通按厘米／秒移动，以及按绝对坐标与角度精准定位。精准定位速度为普通速度的 50%，遇到障碍停止。']), '停止、失焦和离开页面会停止运行；重置保留程序草稿。'] },
      technology: { parameters: ['地图尺寸与起点', '目标、障碍及示例程序', ...(grid ? [] : ['移动速度与转向速度；精准定位固定使用对应速度的 50%'])],
        inputs: grid ? '棋盘坐标、操作命令、时间步长' : 'move_to(x, y)：左下角为原点的整数厘米坐标；turn_to(角度)：0° 向上，顺时针增加；forward/backward 按厘米，forward_time/backward_time 按秒；tick 单位为秒', outputs: '车体中心位置、朝向、定位目标与阶段、物体、夹持、任务进度和运行状态',
        limitations: grid ? ['场景沿用城市棋盘呈现。'] : ['当前 3D 外观为农业比赛场地。', '接触物理用于摆放任务，不包含空间抬升。', '精准定位模拟理想定位，先转向再直行，不自动绕障；车体和夹爪仍参与碰撞。'],
        example: `const runtime = createRobotRuntime(preset, 'auto');\nruntime.start(preset.starter);\nruntime.tick(1 / 60);\nconst state = runtime.snapshot();\nruntime.dispose();` },
    } satisfies DemoManifest<RobotScenario>;
  }));

export const scoringDemo: DemoManifest = {
  id: 'completion-efficiency', title: '完成度与效率计分', summary: '改变任务完成情况、行动数与代码行数，观察每一项得分如何产生。',
  topic: '规则实验', tags: ['计分', '完成判定', '效率'], renderer: 'scoring', form: '交互规则', modes: ['interactive'], status: 'ready', contentVersion: '1.0.0',
  dependencies: [{ id: 'completion-efficiency', version: FUTURE_SCORING_BINDING.version }], configuration: { ...FUTURE_SCORE_POLICY },
  rules: { goal: '理解未来城市的完成分、行动分和代码分。', operation: '调整证据或分值，比较得分变化。', success: '完成任务获得完成分；行动数达标获得效率分；代码核验与行数达标后获得代码分。',
    failure: '未完成为零分；行动未达标不计代码分；未经核验不计代码分。', scoring: '赛事预设为 60 + 20 + 20；手动模式最高 80 分，编程模式最高 100 分。',
    boundaries: ['行动数和代码行数等于目标时仍算达标。', '本页调整的是 DEMO 配置，不会修改正式赛事。'] },
  technology: { parameters: ['完成分', '效率分', '代码分', '行动与代码行数目标'], inputs: '完成状态、实际行动数、经核验的代码行数、操作模式', outputs: '三项得分、总分、满分与判定原因',
    limitations: ['本页不执行服务端身份认证或代码核验。'], example: `scoreWithRelease('1.0.0', {\n  complete: true, actionCount: 8, actionTarget: 8,\n  programMode: true, verifiedCodeLines: 3, codeTarget: 3\n}); // total: 100` },
};
export const mapEditorDemo: DemoManifest<{ embedded: boolean }> = {
  id: 'map-editor', title: '地图编辑器', summary: '点击绘制地图，放置目标与障碍，试走验证后导出，让地图设计成为可复用的赛事内容。',
  topic: '地图工具', tags: ['地图制作', '旷野淘金', '未来城市', 'JSON 导入导出'], renderer: 'map-editor', form: '地图编辑', modes: ['interactive'], status: 'ready', contentVersion: '1.0.0',
  dependencies: [{ id: 'map-editor', version: 'development' }], configuration: { embedded: true },
  rules: { goal: '制作可供旷野淘金或未来城市使用的棋盘地图。', operation: '选择地图类型或参考模板，点击放置元素，调整尺寸、初始方向和任务规则；检查地图后开始试走。',
    success: '淘金地图检查可达性并计算收齐最短步数；机器人地图通过结构检查后，需试走确认打卡或货物配送可完成。',
    failure: '试走后可返回编辑或重新试走；编辑支持撤销与重做，导入失败会保留当前草稿。', scoring: '试走只反馈完成情况、步数与碰撞，不记录正式比赛成绩。',
    boundaries: ['宽度 3–24 格，高度 3–16 格，最多 8 个目标；坐标原点在左下角。', '缩小地图会裁剪界外元素，可撤销恢复；扩大机器人地图会补平台并保留原有空洞。', '货物与同字母泊位配对；打卡点到达即完成，无需夹取或泊位。', '草稿保存在当前浏览器，刷新保留地图，撤销历史不保留；请导出 JSON 备份。'] },
  technology: { parameters: ['地图类型与参考模板', '宽高、起点、车头朝向', '金币、宝箱、打卡点、障碍、平台、货物与泊位', '收集顺序、步数上限、任务说明', 'embedded：嵌入展示中心或作为独立页面'],
    inputs: '格子点击、地图属性、单张 LevelDef JSON 或关卡包（取第一张）', outputs: '浏览器本机草稿、单张 LevelDef JSON、结构检查与试走状态',
    limitations: ['同一 MapEditor 组件用于 DEMO 与 /editor/，修改能力会同时生效。', '使用共享 createGameState / step / solve 规则；机器人地图只做结构检查，不保证可通关。', '支持棋盘地图，平台高度不参与试走物理；不编辑 3D 连续物理场地。', '导出不会自动发布到比赛，接入时需配置独立任务编号、内容版本及关卡白名单。'],
    example: `import MapEditor from './MapEditor';\n\n// 在项目页面中嵌入同一编辑器\n<MapEditor embedded />\n\n// 在地图导入流程中验证 JSON\nimport { parseMap } from './map-editor-model';\nconst level = parseMap(JSON.parse(fileText));`,
    exportNote: '下方下载的是编辑器嵌入配置（embedded），不是地图。保存地图请在「体验」中点击「导出地图」，获得单张 LevelDef JSON；导出不会自动修改赛事。' },
};
export const demoManifests: DemoManifest[] = [...robotDemoManifests, scoringDemo, mapEditorDemo];
export function validateDemoRegistry(entries: DemoManifest[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id)) throw new Error(`DEMO 标识无效或重复：${entry.id}`);
    ids.add(entry.id);
    if (!entry.title || !entry.renderer || !entry.contentVersion || !entry.modes.length) throw new Error(`DEMO 信息不完整：${entry.id}`);
    for (const dep of entry.dependencies) if (!gameplayComponents.some(c => c.id === dep.id && c.version === dep.version)) throw new Error(`组件版本未注册：${dep.id}@${dep.version}`);
  }
}
validateDemoRegistry(demoManifests);
export function exportDemoPreset(demo: DemoManifest, configuration = demo.configuration) {
  return structuredClone({ schemaVersion: 1, demoId: demo.id, contentVersion: demo.contentVersion, components: demo.dependencies, configuration });
}
