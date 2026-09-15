export const isFuture = /^\/future(?:\/|$)/.test(window.location.pathname);
export const competition = isFuture ? 'future' : 'coin';
export const skin = {
  title: isFuture ? '未来城市' : '旷野淘金',
  subtitle: isFuture ? '循环搬运 · 测试赛' : '校园挑战',
  vehicle: isFuture ? '/assets/future/aircar.svg' : '/assets/car.png',
  resource: isFuture ? '/assets/future/energy.svg' : '/assets/coin.png',
  chest: isFuture ? '/assets/future/super-energy.svg' : '/assets/chest_reference.png',
  resourceName: isFuture ? '送达' : '金币',
};
