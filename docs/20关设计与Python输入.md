# 20 关设计与 Python 输入边界（V2.1：金币递增至6枚）

同一关 Lnn 对应键盘 Knn、Python Pnn；地图、金币、障碍、顺序和判分相同。20 张地图共形成 40 个可独立记录的模式关卡。下文含教师答案，不能整份发送给学生端。

坐标原点左下；向上 y+1，向右 x+1。每个按钮/输入/按键及其时间必须按《全量埋点与玩家标识.md》记录。

## 关卡总览

|地图|键盘|Python|关卡|阶段|金币|障碍|要求顺序|最短步数|Python 可输入|
|---|---|---|---|---|---:|---:|---|---:|---|
|L01|K01|P01|迈出第一步|任意拾取/操作探索|1|0|自主选择|2|每行方向|
|L02|K02|P02|向上出发|任意拾取/操作探索|1|0|自主选择|3|每行方向|
|L03|K03|P03|拐个弯|任意拾取/操作探索|1|0|自主选择|5|每行方向|
|L04|K04|P04|两枚都要|任意拾取/操作探索|2|0|自主选择|9|每行方向|
|L05|K05|P05|换个顺序试试|任意拾取/操作探索|2|0|自主选择|8|每段方向与次数|
|L06|K06|P06|两枚金币与路障|任意拾取/操作探索|2|2|自主选择|8|每段方向与次数|
|L07|K07|P07|从缺口通过|给定顺序教学|2|3|A→B|9|每段方向与次数|
|L08|K08|P08|三枚与一道长墙|给定顺序教学|3|4|A→B→C|17|每段方向与次数|
|L09|K09|P09|三枚按顺序|给定顺序教学|3|4|A→B→C|13|每段方向与次数|
|L10|K10|P10|连续两个缺口|给定顺序教学|3|8|A→B→C|15|每段方向与次数|
|L11|K11|P11|四枚连续绕障|给定顺序教学|4|7|B→C→A→D|23|每段方向与次数|
|L12|K12|P12|四枚途中有先后|给定顺序教学|4|6|A→B→C→D|20|每段方向与次数|
|L13|K13|P13|四枚分区规划|自主优化|4|8|自主选择|20|每段方向与次数|
|L14|K14|P14|最近与顺路组合|自主优化|4|8|自主选择|17|每段方向与次数|
|L15|K15|P15|五枚横墙两端|自主优化|5|10|自主选择|30|每段方向与次数|
|L16|K16|P16|五枚双侧出口|自主优化|5|12|自主选择|26|每段方向与次数|
|L17|K17|P17|五枚凹形围墙|自主优化|5|16|自主选择|30|每段方向与次数|
|L18|K18|P18|六枚三层区域|自主优化|6|16|自主选择|35|每段方向与次数|
|L19|K19|P19|六枚回头有价值|自主优化|6|18|自主选择|36|每段方向与次数|
|L20|K20|P20|六枚综合路线挑战|自主优化|6|20|自主选择|40|每段方向与次数|

## 金币数量与难度递进

|关卡|金币数|地图/路线重点|
|---|---:|---|
|01–03|1|方向、坐标、拐弯|
|04–07|2|自由顺序、首次绕障、给定顺序|
|08–10|3|连续目标、多段绕行|
|11–14|4|分区、途中拾取、顺路组合|
|15–17|5|双侧出口、凹形围墙、区域顺序|
|18–20|6|10×10地图、多层通道、综合规划|

金币数量单调不减，最多6枚；复杂度通过目标数量、通道选择和跨区成本提升，不要求每关最短步数也严格递增。后半段允许先收齐再优化，学生不必手算全部6!种顺序。


## 全局输入规则

P01–P04：输入框只接受 `up/down/left/right`，输入框外固定显示 `move_` 和 `()`。P01–P03 行数固定为 2/3/5；P04 可增删行（1–32 行）。输入 `move_up()` 到方向空也属于格式错误，应提示只填 `up`。

P05–P20：每段有方向和次数两个输入框。允许 `up/down/left/right` 与十进制整数 0–20；最多 24 段、展开后 1–256 步。可增删段；0 表示跳过一段。空值未填完不得运行。固定冒号、括号、缩进与 `_` 不可编辑。学生没有通用代码输入区，界面需清楚区分白底可输入框与灰底只读代码。

所有关都只使用 `move_up()`、`move_down()`、`move_left()`、`move_right()`；P05 起另允许模板提供的 `for _ in range(n):`。不提供自动寻路或直接输入目标坐标的函数。每一次输入变化都记录，不能仅记录最终代码或 800ms 防抖后的内容。

模板 `.template.txt` 含 UI 占位符，不能直接当 Python 执行；填完后产生真实合法 Python。教师答案 `.py` 只用于开发校验，不发给学生。

## L01 迈出第一步 · K01 / P01

- 知识点：一次指令移动一格。
- 学生任务：向右找到金币，捡到即完成。
- 地图：5×5；S=(0, 0)；A=(2, 0)。
- 障碍坐标：无。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各行 direction 输入框。模板 `call_slots_v2`；初始 2 行，允许 2–2 行；不允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`，固定括号。
- 过关：任意实际顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **2 步**；参考实际顺序 A。
- 对应文件：[学生填空模板](python_starters/P01.template.txt) · [教师参考代码](teacher_answers/P01.py)。

![L01 地图](maps_v2/L01.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
move_{{direction_1}}()
move_{{direction_2}}()
```

每关专属观察：第一条有效输入、方向修正、完成后是否继续尝试移动。


## L02 向上出发 · K02 / P02

- 知识点：y 向上增加。
- 学生任务：观察坐标，找到上方的金币。
- 地图：5×5；S=(0, 0)；A=(0, 3)。
- 障碍坐标：无。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各行 direction 输入框。模板 `call_slots_v2`；初始 3 行，允许 3–3 行；不允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`，固定括号。
- 过关：任意实际顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **3 步**；参考实际顺序 A。
- 对应文件：[学生填空模板](python_starters/P02.template.txt) · [教师参考代码](teacher_answers/P02.py)。

![L02 地图](maps_v2/L02.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
move_{{direction_1}}()
move_{{direction_2}}()
move_{{direction_3}}()
```

每关专属观察：第一条有效输入、方向修正、完成后是否继续尝试移动。


## L03 拐个弯 · K03 / P03

- 知识点：组合水平和竖直移动。
- 学生任务：换方向也能继续走；不必返回起点。
- 地图：5×5；S=(0, 0)；A=(3, 2)。
- 障碍坐标：无。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各行 direction 输入框。模板 `call_slots_v2`；初始 5 行，允许 5–5 行；不允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`，固定括号。
- 过关：任意实际顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **5 步**；参考实际顺序 A。
- 对应文件：[学生填空模板](python_starters/P03.template.txt) · [教师参考代码](teacher_answers/P03.py)。

![L03 地图](maps_v2/L03.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
move_{{direction_1}}()
move_{{direction_2}}()
move_{{direction_3}}()
move_{{direction_4}}()
move_{{direction_5}}()
```

每关专属观察：第一条有效输入、方向修正、完成后是否继续尝试移动。


## L04 两枚都要 · K04 / P04

- 知识点：任意顺序收集。
- 学生任务：任意顺序捡完两枚金币。
- 地图：5×5；S=(0, 0)；A=(1, 3)，B=(4, 1)。
- 障碍坐标：无。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各行 direction 输入框。模板 `call_slots_v2`；初始 10 行，允许 1–32 行；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`，固定括号。
- 过关：任意实际顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **9 步**；参考实际顺序 A→B。
- 对应文件：[学生填空模板](python_starters/P04.template.txt) · [教师参考代码](teacher_answers/P04.py)。

![L04 地图](maps_v2/L04.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
move_{{direction_1}}()
move_{{direction_2}}()
move_{{direction_3}}()
move_{{direction_4}}()
move_{{direction_5}}()
move_{{direction_6}}()
move_{{direction_7}}()
move_{{direction_8}}()
move_{{direction_9}}()
move_{{direction_10}}()
```

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。

## L05 换个顺序试试 · K05 / P05

- 知识点：顺序影响不返程总距离。
- 学生任务：先试一种顺序，再比较另一种。
- 地图：5×5；S=(2, 2)；A=(0, 2)，B=(4, 4)。
- 障碍坐标：无。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **8 步**；参考实际顺序 A→B。
- 对应文件：[学生填空模板](python_starters/P05.template.txt) · [教师参考代码](teacher_answers/P05.py)。

![L05 地图](maps_v2/L05.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L06 两枚金币与路障 · K06 / P06

- 知识点：碰撞与绕行。
- 学生任务：绕开路障，捡完两枚金币。
- 地图：5×5；S=(0, 1)；A=(4, 1)，B=(4, 3)。
- 障碍坐标：(2, 1), (2, 2)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **8 步**；参考实际顺序 B→A。
- 对应文件：[学生填空模板](python_starters/P06.template.txt) · [教师参考代码](teacher_answers/P06.py)。

![L06 地图](maps_v2/L06.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L07 从缺口通过 · K07 / P07

- 知识点：给定顺序分段数步。
- 学生任务：按 A→B，数一数经过缺口要走几格。
- 地图：5×5；S=(0, 0)；A=(0, 2)，B=(4, 1)。
- 障碍坐标：(2, 0), (2, 1), (2, 2)。
- 拾取顺序：A→B；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：按指定顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **9 步**；参考实际顺序 A→B。
- 对应文件：[学生填空模板](python_starters/P07.template.txt) · [教师参考代码](teacher_answers/P07.py)。

![L07 地图](maps_v2/L07.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

教学：先标出下一枚金币；把本关参考轨迹逐格播放并计步，再对其中一段增加合法的往返两步进行比较。L09 的固定演示为上4右6下3（13步）和上4右4上1右2下4（15步）。演示轨迹另存 demo 流，不占正式轮次。L12 必须专门解释：不能提前经过 C。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L08 三枚与一道长墙 · K08 / P08

- 知识点：障碍距离不同于坐标差。
- 学生任务：按 A→B→C，分别规划墙两侧的路段。
- 地图：6×6；S=(0, 0)；A=(1, 4)，B=(5, 1)，C=(4, 5)。
- 障碍坐标：(3, 0), (3, 1), (3, 2), (3, 3)。
- 拾取顺序：A→B→C；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：按指定顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **17 步**；参考实际顺序 A→B→C。
- 对应文件：[学生填空模板](python_starters/P08.template.txt) · [教师参考代码](teacher_answers/P08.py)。

![L08 地图](maps_v2/L08.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

教学：先标出下一枚金币；把本关参考轨迹逐格播放并计步，再对其中一段增加合法的往返两步进行比较。L09 的固定演示为上4右6下3（13步）和上4右4上1右2下4（15步）。演示轨迹另存 demo 流，不占正式轮次。L12 必须专门解释：不能提前经过 C。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L09 三枚按顺序 · K09 / P09

- 知识点：同一顺序比较路线。
- 学生任务：按 A→B→C，比较 13 步和 15 步的路线。
- 地图：7×7；S=(0, 0)；A=(0, 3)，B=(4, 4)，C=(6, 1)。
- 障碍坐标：(2, 0), (2, 1), (2, 2), (2, 3)。
- 拾取顺序：A→B→C；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：按指定顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **13 步**；参考实际顺序 A→B→C。
- 对应文件：[学生填空模板](python_starters/P09.template.txt) · [教师参考代码](teacher_answers/P09.py)。

![L09 地图](maps_v2/L09.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

教学：先标出下一枚金币；把本关参考轨迹逐格播放并计步，再对其中一段增加合法的往返两步进行比较。L09 的固定演示为上4右6下3（13步）和上4右4上1右2下4（15步）。演示轨迹另存 demo 流，不占正式轮次。L12 必须专门解释：不能提前经过 C。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L10 连续两个缺口 · K10 / P10

- 知识点：组合多段绕障。
- 学生任务：按 A→B→C，依次通过两道墙。
- 地图：7×7；S=(0, 0)；A=(1, 2)，B=(4, 5)，C=(6, 1)。
- 障碍坐标：(2, 0), (2, 1), (2, 2), (2, 3), (5, 3), (5, 4), (5, 5), (5, 6)。
- 拾取顺序：A→B→C；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：按指定顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **15 步**；参考实际顺序 A→B→C。
- 对应文件：[学生填空模板](python_starters/P10.template.txt) · [教师参考代码](teacher_answers/P10.py)。

![L10 地图](maps_v2/L10.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

教学：先标出下一枚金币；把本关参考轨迹逐格播放并计步，再对其中一段增加合法的往返两步进行比较。L09 的固定演示为上4右6下3（13步）和上4右4上1右2下4（15步）。演示轨迹另存 demo 流，不占正式轮次。L12 必须专门解释：不能提前经过 C。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L11 四枚连续绕障 · K11 / P11

- 知识点：四目标分段组合。
- 学生任务：按 B→C→A→D；到 A 的路并非一直向上。
- 地图：8×8；S=(0, 0)；A=(3, 5)，B=(6, 0)，C=(3, 1)，D=(7, 6)。
- 障碍坐标：(2, 3), (2, 4), (3, 3), (4, 3), (4, 4), (5, 4), (5, 5)。
- 拾取顺序：B→C→A→D；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：按指定顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **23 步**；参考实际顺序 B→C→A→D。
- 对应文件：[学生填空模板](python_starters/P11.template.txt) · [教师参考代码](teacher_answers/P11.py)。

![L11 地图](maps_v2/L11.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

教学：先标出下一枚金币；把本关参考轨迹逐格播放并计步，再对其中一段增加合法的往返两步进行比较。L09 的固定演示为上4右6下3（13步）和上4右4上1右2下4（15步）。演示轨迹另存 demo 流，不占正式轮次。L12 必须专门解释：不能提前经过 C。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L12 四枚途中有先后 · K12 / P12

- 知识点：经过金币也会自动拾取。
- 学生任务：按 A→B→C→D，去 B 时别提前经过 C。
- 地图：8×8；S=(0, 0)；A=(1, 1)，B=(6, 1)，C=(3, 1)，D=(6, 6)。
- 障碍坐标：(3, 2), (3, 3), (3, 4), (3, 5), (5, 4), (6, 4)。
- 拾取顺序：A→B→C→D；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 6 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：按指定顺序收齐；教学阶段允许反复练习。
- 教师基准：本任务最短 **20 步**；参考实际顺序 A→B→C→D。
- 对应文件：[学生填空模板](python_starters/P12.template.txt) · [教师参考代码](teacher_answers/P12.py)。

![L12 地图](maps_v2/L12.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
```

教学：先标出下一枚金币；把本关参考轨迹逐格播放并计步，再对其中一段增加合法的往返两步进行比较。L09 的固定演示为上4右6下3（13步）和上4右4上1右2下4（15步）。演示轨迹另存 demo 流，不占正式轮次。L12 必须专门解释：不能提前经过 C。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L13 四枚分区规划 · K13 / P13

- 知识点：从给定顺序迁移到自主排序。
- 学生任务：四枚金币分在不同区域，自己比较顺序与通路。
- 地图：8×8；S=(0, 0)；A=(1, 3)，B=(7, 1)，C=(5, 6)，D=(1, 7)。
- 障碍坐标：(2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (4, 4), (5, 4), (6, 4)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **20 步**；参考实际顺序 A→D→C→B。
- 对应文件：[学生填空模板](python_starters/P13.template.txt) · [教师参考代码](teacher_answers/P13.py)。

![L13 地图](maps_v2/L13.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L14 最近与顺路组合 · K14 / P14

- 知识点：最近邻与成组访问的比较。
- 学生任务：比较最近的一枚与顺路的两枚，最多三次改进。
- 地图：8×8；S=(3, 1)；A=(1, 4)，B=(6, 0)，C=(1, 0)，D=(7, 0)。
- 障碍坐标：(1, 3), (2, 3), (3, 3), (3, 4), (3, 5), (5, 3), (5, 4), (5, 5)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **17 步**；参考实际顺序 D→B→C→A。
- 对应文件：[学生填空模板](python_starters/P14.template.txt) · [教师参考代码](teacher_answers/P14.py)。

![L14 地图](maps_v2/L14.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L15 五枚横墙两端 · K15 / P15

- 知识点：比较分区与墙两端通路。
- 学生任务：五枚金币分布在墙两侧，比较先后访问的总成本。
- 地图：9×9；S=(4, 0)；A=(0, 2)，B=(8, 2)，C=(2, 8)，D=(6, 7)，E=(4, 4)。
- 障碍坐标：(1, 3), (2, 3), (3, 3), (4, 3), (4, 5), (4, 6), (4, 7), (5, 3), (6, 3), (7, 3)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **30 步**；参考实际顺序 B→D→C→E→A。
- 对应文件：[学生填空模板](python_starters/P15.template.txt) · [教师参考代码](teacher_answers/P15.py)。

![L15 地图](maps_v2/L15.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L16 五枚双侧出口 · K16 / P16

- 知识点：通过不同出口连接区域。
- 学生任务：规划左右和上方的五个目标，减少重复穿越。
- 地图：9×9；S=(4, 4)；A=(1, 1)，B=(7, 7)，C=(1, 7)，D=(7, 1)，E=(4, 8)。
- 障碍坐标：(3, 2), (3, 3), (3, 4), (3, 5), (3, 6), (3, 7), (5, 0), (5, 1), (5, 2), (5, 3), (5, 4), (5, 5)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **26 步**；参考实际顺序 A→C→E→B→D。
- 对应文件：[学生填空模板](python_starters/P16.template.txt) · [教师参考代码](teacher_answers/P16.py)。

![L16 地图](maps_v2/L16.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L17 五枚凹形围墙 · K17 / P17

- 知识点：考虑凹形围墙的进出成本。
- 学生任务：不要漏掉围墙内的金币，先安排进出顺序。
- 地图：9×9；S=(0, 0)；A=(3, 3)，B=(8, 1)，C=(1, 7)，D=(7, 7)，E=(4, 8)。
- 障碍坐标：(2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (3, 1), (4, 1), (5, 1), (5, 2), (5, 3), (5, 4), (5, 5), (5, 6), (6, 5), (7, 5)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **30 步**；参考实际顺序 B→D→E→C→A。
- 对应文件：[学生填空模板](python_starters/P17.template.txt) · [教师参考代码](teacher_answers/P17.py)。

![L17 地图](maps_v2/L17.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L18 六枚三层区域 · K18 / P18

- 知识点：六目标分区规划。
- 学生任务：将六枚金币按区域组合，再比较跨区顺序。
- 地图：10×10；S=(0, 4)；A=(2, 0)，B=(9, 4)，C=(6, 9)，D=(1, 8)，E=(8, 1)，F=(5, 5)。
- 障碍坐标：(1, 3), (2, 3), (2, 6), (3, 3), (3, 6), (4, 3), (4, 6), (4, 7), (4, 8), (5, 3), (5, 6), (6, 3), (6, 6), (7, 3), (7, 6), (8, 6)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **35 步**；参考实际顺序 A→E→B→F→D→C。
- 对应文件：[学生填空模板](python_starters/P18.template.txt) · [教师参考代码](teacher_answers/P18.py)。

![L18 地图](maps_v2/L18.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L19 六枚回头有价值 · K19 / P19

- 知识点：必要回头与无效重复的区别。
- 学生任务：比较何时进入长通道，路可以回头但捡完就停。
- 地图：10×10；S=(4, 0)；A=(0, 1)，B=(9, 1)，C=(4, 9)，D=(1, 8)，E=(8, 8)，F=(4, 4)。
- 障碍坐标：(1, 5), (2, 5), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6), (3, 7), (3, 8), (5, 1), (5, 2), (5, 3), (5, 4), (5, 5), (5, 6), (5, 7), (7, 4), (8, 4)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **36 步**；参考实际顺序 F→A→D→C→E→B。
- 对应文件：[学生填空模板](python_starters/P19.template.txt) · [教师参考代码](teacher_answers/P19.py)。

![L19 地图](maps_v2/L19.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。


## L20 六枚综合路线挑战 · K20 / P20

- 知识点：六目标顺序与复杂通道联合规划。
- 学生任务：综合比较六枚金币的顺序与绕障路线，收集、比较、修改。
- 地图：10×10；S=(0, 0)；A=(1, 8)，B=(9, 2)，C=(6, 9)，D=(4, 2)，E=(8, 7)，F=(4, 6)。
- 障碍坐标：(2, 0), (2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (3, 7), (4, 4), (4, 5), (4, 7), (5, 7), (6, 1), (6, 2), (6, 3), (6, 4), (6, 7), (7, 5), (7, 6), (7, 7)。
- 拾取顺序：不限，以实际拾取顺序为准；捡完立即停止，不返回。
- 键盘操作：方向键/WASD 或四向按钮；每次尝试一格。
- Python 可编辑：各段 direction 与 count 输入框。模板 `repeat_slots_v2`；初始 8 段，允许 1–24 段；允许增删。
- Python 允许代码：`move_up()`, `move_down()`, `move_left()`, `move_right()`；固定重复模板 `for _ in range(n):`，n 为 0–20。
- 过关：任意实际顺序收齐；每模式最多 3 轮；收集分和最短路线分分开。
- 教师基准：本任务最短 **40 步**；参考实际顺序 A→C→E→B→D→F。
- 对应文件：[学生填空模板](python_starters/P20.template.txt) · [教师参考代码](teacher_answers/P20.py)。

![L20 地图](maps_v2/L20.svg)

学生初始可填区域（双花括号是 UI 占位符）：

```text
for _ in range({{count_1}}):
    move_{{direction_1}}()
for _ in range({{count_2}}):
    move_{{direction_2}}()
for _ in range({{count_3}}):
    move_{{direction_3}}()
for _ in range({{count_4}}):
    move_{{direction_4}}()
for _ in range({{count_5}}):
    move_{{direction_5}}()
for _ in range({{count_6}}):
    move_{{direction_6}}()
for _ in range({{count_7}}):
    move_{{direction_7}}()
for _ in range({{count_8}}):
    move_{{direction_8}}()
```

开始前填写预计顺序，可选预计步数；执行后记录实际顺序。当前阶段结束前不显示最优顺序或差几步；教师路线援助必须标记。

每关专属观察：第一计划、首次路线、撞墙位置、重来原因、不同方案与最终选择。

