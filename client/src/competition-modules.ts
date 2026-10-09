export const competitionModules = {
  beach: { id: 'beach', title: '潮汐拾光', subtitle: '第四赛事 · 海边拾贝', mark: '◒', home: '/beach/',
    eyebrow: 'TIDAL TREASURES · 04', headline: ['循着海风出发，', '拾起一岸好时光。'],
    description: ['驾驶小车，在沙滩上寻找潮汐留下的贝壳。', '从键盘驾驶到代码操控，用更短时间送回岸边。'],
    tags: ['3D 海滩', '手动 / 编程', '拾贝竞速'], motto: '把贝壳送回岸边，把好时光留住' },
  coin: { id: 'coin', title: '旷野淘金', subtitle: '第一赛事 · 路径规划', mark: '◆', home: '/',
    eyebrow: 'WILD GOLD · 01', headline: ['让每一次出发，', '都有更好的路线。'],
    description: ['观察金币与障碍，规划你的寻宝路线。', '用操作探索，用程序完成淘金任务。'],
    tags: ['棋盘寻宝', '路径规划', '编程挑战'], motto: '观察地图，规划每一步' },
  future: { id: 'future', title: '未来城市', subtitle: '第二赛事 · 循环挑战', mark: '✦', home: '/future/',
    eyebrow: 'FUTURE CITY · 02', headline: ['让每一段程序，', '驱动城市运转。'],
    description: ['观察城市道路，完成巡逻与搬运任务。', '用循环精简代码，探索更好的解决方案。'],
    tags: ['立体城市', '循环编程', '机器人任务'], motto: '编排指令，探索未来' },
  farm: { id: 'farm', title: '生态农场', subtitle: '第三赛事 · 机器人挑战', mark: '♧', home: '/farm/',
    eyebrow: 'ECO FARM · 03', headline: ['让每一个想法，', '在农场里生长。'],
    description: ['观察草莓坐标，编写程序逐株采摘。', '选择更近的边缘，用更少步数完成交付。'],
    tags: ['3D 棋盘', '编程采摘', '最短路线'], motto: '耕耘智慧，收获未来' },
} as const;
export type CompetitionModule = typeof competitionModules[keyof typeof competitionModules];
