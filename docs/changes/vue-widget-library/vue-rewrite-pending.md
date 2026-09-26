# 尚未完成 Vue 重写的原生部件清单

截至 2026-09-25 当前工作树。来源：[全量适配清单](full-adaptation-inventory.json) 与当前 Vue 目录；这是状态快照，后续以清单和代码为准。

## 统计与判定

- 521 个原生 JSON 定义：478 个已有 Vue 基础适配，43 个没有 Vue 运行入口。
- 43 个无入口定义中，34 个按用户确认的产品范围从 Vue 部件库隐藏；另外 9 个仍显示为待适配。
- 另有 160 个安装时由 SVG 元数据生成的 SCADA 符号源，没有 Vue 运行适配。这些是符号源，不应误称为 160 个普通 JSON 部件。
- 681 个源中，完整原生行为一致性验收为 0。基础适配不能算“全部 Vue 重写完成”。
- 资产和设备管理表已经接入查询、搜索、分页、新增、编辑、经纬度属性保存和二次确认删除；预览禁写，正式操作由后端权限继续校验。

## 9 个仍显示为待适配的 JSON 定义

### 网关（7）

需核对网关管理、状态、日志和统计接口及权限；通用图表适配不能替代网关配置行为。

- `gateway_widgets.gateway_configuration` — Gateway Configuration
- `gateway_widgets.config_form_latest` — Gateway configuration (Single device)
- `gateway_widgets.gateway_connectors` — Gateway connectors
- `gateway_widgets.attributes_card` — Gateway events
- `gateway_widgets.gateway_general_configuration` — Gateway general configuration
- `gateway_widgets.gateway_logs` — Gateway logs
- `gateway_widgets.gateway_status` — Gateway status

### SCADA 入口（1）

可重写符号选择、绑定和画布；不能直接执行原生 SVG 内的动态脚本或导入的控制代码。

- `scada_symbol` — SCADA symbol

### 边缘概览（1）

需核对 Edge 管理与状态 API 和权限。

- `edge_widgets.edges_overview` — Edge Quick Overview

## 34 个按产品范围隐藏的定义

这些定义继续保留在 ThingsBoard 后端原始目录中，供导入、导出和数据兼容使用；Vue 部件库的“所有部件”、部件包和服务端合并结果都不会显示它们，所属条目全部被隐藏的空部件包也不会显示。

### 地图与位置（16）

- `image_map`
- `map`
- `route_map`
- `trip_map`
- `maps_v2.google_maps`
- `maps_v2.here_map`
- `maps_v2.image_map`
- `maps_v2.openstreetmap`
- `maps_v2.tencent_maps`
- `maps_v2.route_map`
- `maps_v2.route_map_openstreetmap`
- `maps_v2.route_map_tencent_maps`
- `maps_v2.test`
- `input_widgets.markers_placement_google_maps`
- `input_widgets.markers_placement_image_map`
- `input_widgets.markers_placement_openstreetmap`

### 卡片、导航与平台入口（18）

- `api_usage`
- `cards.dashboard_state_widget`
- `home_page_widgets.dashboards`
- `date.date_range_navigator`
- `home_page_widgets.documentation_links`
- `home_page_widgets.getting_started`
- `cards.html_card`
- `cards.html_value_card`
- `label_card`
- `cards.label_widget`
- `cards.markdown_card`
- `mobile_app_qr_code`
- `navigation_widgets.navigation_card`
- `navigation_widgets.navigation_cards`
- `cards.qr_code`
- `home_page_widgets.quick_links`
- `unread_notifications`
- `home_page_widgets.usage_info`

## 160 个尚未接入 Vue 的 SCADA 符号源

安装时由 SVG 元数据生成。静态路径、颜色、文本可投影到 Vue/SVG；动态绑定、动作和脚本需单独设计声明式模型及安全边界。

- `scada:3-phase-voltage-relay-hp.svg` — HP 3 phase voltage relay
- `scada:apartments-hp.svg` — HP Apartments
- `scada:battery-hp.svg` — HP Battery
- `scada:bottom-flow-meter.svg` — Bottom flow meter
- `scada:bottom-light-bulb-hp.svg` — HP Bottom light bulb
- `scada:bottom-right-elbow-connector-hp.svg` — HP Bottom right elbow connector
- `scada:bottom-right-elbow-pipe.svg` — Bottom right elbow pipe
- `scada:bottom-tee-connector-hp.svg` — HP Bottom tee connector
- `scada:bottom-tee-pipe.svg` — Bottom tee pipe
- `scada:centrifugal-pump.svg` — Centrifugal pump
- `scada:conical-tank.svg` — Conical tank
- `scada:consumers-hp.svg` — HP Consumers
- `scada:control-panel-hp.svg` — HP Control panel
- `scada:crane-hp.svg` — HP Crane
- `scada:cross-connector-hp.svg` — HP Cross connector
- `scada:cross-pipe.svg` — Cross pipe
- `scada:curcuit-breaker-hp.svg` — HP Circuit breaker
- `scada:cylindrical-tank.svg` — Cylindrical tank
- `scada:drawwork-hp.svg` — HP Drawwork
- `scada:drill-hp.svg` — HP Drill
- `scada:drilling-line-hp.svg` — HP Drilling line
- `scada:drilling-rig-hp.svg` — HP Drilling rig
- `scada:dynamic-horizontal-scale-hp.svg` — HP Dynamic horizontal scale
- `scada:dynamic-vertical-scale-hp.svg` — HP Dynamic vertical scale
- `scada:electrical-distribution-board-hp.svg` — HP Electrical distribution board
- `scada:electrical-engine-hp.svg` — HP Electrical engine
- `scada:elevated-tank.svg` — Elevated tank
- `scada:energy-meter-hp.svg` — HP Energy meter
- `scada:extra-long-horizontal-pipe.svg` — Extra long horizontal pipe
- `scada:extra-long-vertical-pipe.svg` — Extra long vertical pipe
- `scada:filter-hp.svg` — HP Filter
- `scada:four-rate-energy-meter-hp.svg` — HP Four-rate energy meter
- `scada:fuel-generator-hp.svg` — HP Fuel generator
- `scada:gas-preventer-hp.svg` — HP Gas preventer
- `scada:gas-wellhead-hp.svg` — HP Gas wellhead
- `scada:heat-exchanger-hp.svg` — HP Heat exchanger
- `scada:heat-pump-hp.svg` — HP Heat pump
- `scada:high-voltage-tower-hp.svg` — HP High voltage tower
- `scada:hook-hp.svg` — HP Hook
- `scada:horizontal-ball-valve.svg` — Horizontal ball valve
- `scada:horizontal-broken-pipe.svg` — Horizontal broken pipe
- `scada:horizontal-connector-hp.svg` — HP Horizontal connector
- `scada:horizontal-curcuit-breaker-hp.svg` — HP Horizontal circuit breaker
- `scada:horizontal-energy-system-controller-hp.svg` — HP Horizontal energy systems controller
- `scada:horizontal-inline-flow-meter.svg` — Horizontal inline flow meter
- `scada:horizontal-pipe.svg` — Horizontal pipe
- `scada:horizontal-tank-hp.svg` — HP Horizontal tank
- `scada:horizontal-tank.svg` — Horizontal tank
- `scada:horizontal-valve-hp.svg` — HP Horizontal valve
- `scada:horizontal-wheel-valve.svg` — Horizontal wheel valve
- `scada:house-hp.svg` — HP House
- `scada:industrial-fuel-generator-hp.svg` — HP Industrial fuel generator
- `scada:inverter-hp.svg` — HP Inverter
- `scada:large-conical-tank.svg` — Large conical tank
- `scada:large-cylindrical-tank.svg` — Large cylindrical tank
- `scada:large-horizontal-separator-connector-hp.svg` — HP Large horizontal separator with connector
- `scada:large-horizontal-separator-hp.svg` — HP Large horizontal separator
- `scada:large-inverter-hp.svg` — HP Large inverter
- `scada:large-stand-cylindrical-tank.svg` — Large stand cylindrical tank
- `scada:large-stand-vertical-tank.svg` — Large stand vertical tank
- `scada:large-vertical-separator-connector-hp.svg` — HP Large vertical separator with connector
- `scada:large-vertical-separator-hp.svg` — HP Large vertical separator
- `scada:large-vertical-tank.svg` — Large vertical tank
- `scada:leak-sensor.svg` — Leak sensor
- `scada:left-analog-water-level-meter.svg` — Left analog water level meter
- `scada:left-bottom-elbow-connector-hp.svg` — HP Left bottom elbow connector
- `scada:left-bottom-elbow-pipe.svg` — Left bottom elbow pipe
- `scada:left-drain-pipe.svg` — Left drain pipe
- `scada:left-elbow-drain-pipe.svg` — Left elbow drain pipe
- `scada:left-flow-meter.svg` — Left flow meter
- `scada:left-heat-pump.svg` — Left heat pump
- `scada:left-motor-pump.svg` — Left motor pump
- `scada:left-tee-connector-hp.svg` — HP Left tee connector
- `scada:left-tee-pipe.svg` — Left tee pipe
- `scada:left-top-elbow-connector-hp.svg` — HP Left top elbow connector
- `scada:left-top-elbow-pipe.svg` — Left top elbow pipe
- `scada:long-bottom-filter.svg` — Long bottom filter
- `scada:long-horizontal-broken-pipe.svg` — Long horizontal broken pipe
- `scada:long-horizontal-connector-hp.svg` — HP Long horizontal connector
- `scada:long-horizontal-pipe.svg` — Long horizontal pipe
- `scada:long-top-filter.svg` — Long top filter
- `scada:long-vertical-broken-pipe.svg` — Long vertical broken pipe
- `scada:long-vertical-connector-hp.svg` — HP Long vertical connector
- `scada:long-vertical-pipe.svg` — Long vertical pipe
- `scada:low-voltage-tower-hp.svg` — HP Low voltage tower
- `scada:low-voltage-transformer-tower-hp.svg` — HP Low voltage transformer tower
- `scada:manufacture-hp.svg` — HP Manufacture
- `scada:meter.svg` — Meter
- `scada:oil-pump-hp.svg` — HP Oil pump
- `scada:platform-hp.svg` — HP Platform
- `scada:pool-hp.svg` — HP Pool
- `scada:pool.svg` — Pool
- `scada:power-socket-hp.svg` — HP Power socket
- `scada:power-transformer-hp.svg` — HP Power transformer
- `scada:preventer-hp.svg` — HP Preventer
- `scada:pump-hp.svg` — HP Centrifugal pump
- `scada:right-analog-water-level-meter.svg` — Right analog water level meter
- `scada:right-drain-pipe.svg` — Right drain pipe
- `scada:right-elbow-drain-pipe.svg` — Right elbow drain pipe
- `scada:right-flow-meter.svg` — Right flow meter
- `scada:right-heat-pump.svg` — Right heat pump
- `scada:right-motor-pump.svg` — Right motor pump
- `scada:right-tee-connector-hp.svg` — HP Right tee connector
- `scada:right-tee-pipe.svg` — Right tee pipe
- `scada:rotor-hp.svg` — HP Rotor
- `scada:sand-filter-hp.svg` — HP Sand filter
- `scada:sand-filter.svg` — Sand filter
- `scada:short-bottom-filter.svg` — Short bottom filter
- `scada:short-left-drain-pipe.svg` — Short left drain pipe
- `scada:short-right-drain-pipe.svg` — Short right drain pipe
- `scada:short-top-filter.svg` — Short top filter
- `scada:short-vertical-tank-hp.svg` — HP Short vertical tank
- `scada:simple-horizontal-scale-hp.svg` — HP Simple horizontal scale
- `scada:simple-vertical-scale-hp.svg` — HP Simple vertical scale
- `scada:single-key-switch-hp.svg` — HP Single-key switch
- `scada:small-cylindrical-tank.svg` — Small cylindrical tank
- `scada:small-horizontal-separator-connector-hp.svg` — HP Small horizontal separator with connector
- `scada:small-horizontal-separator-hp.svg` — HP Small horizontal separator
- `scada:small-left-meter.svg` — Small left meter
- `scada:small-left-motor-pump.svg` — Small left motor pump
- `scada:small-meter.svg` — Small meter
- `scada:small-power-transformer-hp.svg` — HP Small power transformer
- `scada:small-right-center.svg` — Small right meter
- `scada:small-right-motor-pump.svg` — Small right motor pump
- `scada:small-spherical-tank.svg` — Small spherical tank
- `scada:small-vertical-separator-connector-hp.svg` — HP Small vertical separator with connector
- `scada:small-vertical-separator-hp.svg` — HP Small vertical separator
- `scada:solar-panel-hp.svg` — HP Solar panel
- `scada:spherical-tank.svg` — Spherical tank
- `scada:stand-cylindrical-tank.svg` — Stand cylindrical tank
- `scada:stand-horizontal-tank.svg` — Stand horizontal tank
- `scada:stand-solar-panel-hp.svg` — HP Stand solar panel
- `scada:stand-vertical-short-tank.svg` — Stand vertical short tank
- `scada:stand-vertical-tank.svg` — Stand vertical tank
- `scada:three-rate-energy-meter-hp.svg` — HP Three-rate energy meter
- `scada:top-flow-meter.svg` — Top flow meter
- `scada:top-light-bulb-hp.svg` — HP Top light bulb
- `scada:top-right-elbow-connector-hp.svg` — HP Top right elbow connector
- `scada:top-right-elbow-pipe.svg` — Top right elbow pipe
- `scada:top-tee-connector-hp.svg` — HP Top tee connector
- `scada:top-tee-pipe.svg` — Top tee pipe
- `scada:turbine-hp.svg` — HP Turbine
- `scada:two-key-switch-hp.svg` — HP Two-key switch
- `scada:two-rate-energy-meter-hp.svg` — HP Two-rate energy meter
- `scada:vertical-ball-valve.svg` — Vertical ball valve
- `scada:vertical-broken-pipe.svg` — Vertical broken pipe
- `scada:vertical-connector-hp.svg` — HP Vertical connector
- `scada:vertical-energy-system-controller-hp.svg` — HP Vertical energy systems controller
- `scada:vertical-inline-flow-meter.svg` — Vertical inline flow meter
- `scada:vertical-pipe.svg` — Vertical pipe
- `scada:vertical-short-tank.svg` — Vertical short tank
- `scada:vertical-tank-hp.svg` — HP Vertical tank
- `scada:vertical-tank.svg` — Vertical tank
- `scada:vertical-valve-hp.svg` — HP Vertical valve
- `scada:vertical-wheel-valve.svg` — Vertical wheel valve
- `scada:voltage-relay-hp.svg` — HP Voltage relay
- `scada:voltage-stabilizer-hp.svg` — HP Voltage stabilizer
- `scada:waterstop.svg` — Water stop
- `scada:wind-turbine-cluster-hp.svg` — HP Wind turbine cluster
- `scada:wind-turbine-hp.svg` — HP Wind turbine

## 当前不能直接照搬的原生能力

- **任意 Angular 模板和控制脚本**：Vue 不运行 Angular 组件；原始 `controllerScript`、导入的 HTML/JS 只能作为数据保留，不能自动执行或视为已迁移。可按明确功能逐项重写。
- **函数数据源、后处理和自定义颜色函数**：当前适配契约不执行任意用户脚本；需要受限表达式/声明式规则或经批准的安全执行方案。
- **RPC、GPIO、属性写入、网关与 Edge 管理**：Vue 界面能实现，但实际操作须使用已核实的认证 API、后端权限和显式用户动作；没有对应能力时不能假称原生等价。
- **外部地图服务与设备输入**：供应商地图需其 SDK、授权与数据契约；已接入的拍照输入仍需以真实浏览器权限、图库上传和写后回读验收，图库上传成功但后续字段写入失败时可能留下未引用图片。

因此没有把上述 205 个源判为“永远不能 Vue 重写”。更准确的状态是：当前未实现，部分需额外条件；原生任意脚本不能在现有安全边界内直接照搬。
