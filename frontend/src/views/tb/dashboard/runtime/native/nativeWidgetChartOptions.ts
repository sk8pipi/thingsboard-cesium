import type { EChartsOption } from 'echarts';
import { nativeStateLabel, nativeStatePoints } from './nativeStateCore';
import type { NativeOptions } from './nativeWidgetTypes';
import { nativeSeriesSettings, withNativeSettings } from './nativeWidgetSettings';
import { formatNativeValue, nativeNumber, nativeThresholdColor, type NativeSeries } from './nativeWidgetDataCore';

/** Shared by the live widget and its preview. Never executes imported functions. */
export function nativeChartOptions(
  options: NativeOptions,
  series: NativeSeries[],
  window?: { startTs: number; endTs: number } | null,
): EChartsOption {
  const native = withNativeSettings(options);
  const format = (value: unknown, entry: NativeSeries) =>
    (native.family === 'state' ? nativeStateLabel(value, native.state) : undefined) ??
    formatNativeValue(value, entry.key.decimals ?? 2, entry.key.units);
  const color = (entry: NativeSeries, value: unknown = entry.latest?.value) =>
    nativeThresholdColor(
      value,
      native,
      native.family === 'range' ? native.range.outOfRangeColor : entry.key.color || '#6ce9ff',
    );
  const position = native.chart.legendPosition;
  const verticalLegend = position === 'left' || position === 'right';
  const legend = {
    show: native.showLegend,
    type: 'scroll' as const,
    orient: verticalLegend ? ('vertical' as const) : ('horizontal' as const),
    [position]: 0,
    ...(verticalLegend ? { top: 'middle' } : {}),
    textStyle: { color: '#dae9f6' },
  };
  const base: EChartsOption = {
    backgroundColor: 'transparent',
    animation: native.chart.animation,
    legend,
    // Canvas has no parent font to inherit; an explicit family keeps configured sizes valid.
    textStyle: { color: '#dae9f6', fontFamily: 'sans-serif' },
    tooltip: { show: native.chart.tooltip, trigger: 'item', renderMode: 'richText', confine: true },
  };
  if (native.family === 'radar') {
    const radial = native.radial;
    const entries = series.filter((entry) => nativeNumber(entry.latest?.value) !== null);
    const values = entries.map((entry) => nativeNumber(entry.latest?.value)!);
    const sharedMax = radial.normalizeAxes ? Math.max(1, ...values) : undefined;
    const sharedMin = radial.normalizeAxes ? Math.min(0, ...values) : undefined;
    return {
      ...base,
      // Radar fields are dimensions of one polygon; the renderer provides per-field controls.
      legend: { show: false },
      radar: {
        shape: radial.shape,
        startAngle: radial.startAngle,
        splitNumber: radial.splitNumber,
        radius: '65%',
        indicator: entries.length
          ? entries.map((entry) => ({
              name: entry.label,
              color: entry.key.color || '#bcd0df',
              min: radial.min ?? sharedMin,
              max: radial.max ?? sharedMax,
            }))
          : [{ name: '', min: 0, max: 1 }],
        axisName: { show: radial.showAxisLabels, fontSize: native.presentation.labelFontSize },
        axisLabel: { show: radial.showTickLabels, color: '#bcd0df' },
        splitArea: { show: false },
        splitLine: { lineStyle: { color: 'rgba(200,220,255,.2)' } },
      },
      series: [
        {
          type: 'radar',
          data: entries.length ? [{ name: '数据', value: values }] : [],
          itemStyle: { color: radial.color },
          lineStyle: { width: radial.showLine ? radial.lineWidth : 0, type: radial.lineType },
          symbol: radial.showPoints ? radial.pointShape : 'none',
          symbolSize: radial.pointSize,
          areaStyle: radial.fillArea ? { color: radial.color, opacity: radial.areaOpacity } : undefined,
          label: {
            show: native.showLabel,
            color: '#dae9f6',
            formatter: (params: any) => {
              const entry = entries[params.dimensionIndex];
              return entry ? format(params.value, entry) : String(params.value ?? '');
            },
          },
          tooltip: {
            formatter: () => entries.map((entry) => `${entry.label}: ${format(entry.latest?.value, entry)}`).join('\n'),
          },
        },
      ],
    };
  }
  if (native.family === 'polar') {
    const radial = native.radial;
    return {
      ...base,
      polar: { radius: '65%', center: ['50%', '52%'] },
      radiusAxis: {
        type: 'value',
        min: radial.min ?? undefined,
        max: radial.max ?? undefined,
        splitNumber: radial.splitNumber,
        axisLabel: { show: radial.showTickLabels, color: '#bcd0df' },
        splitLine: { lineStyle: { color: 'rgba(200,220,255,.2)' } },
      },
      angleAxis: {
        type: 'category',
        data: series.map((entry) => entry.label),
        startAngle: radial.startAngle,
        axisLabel: { show: radial.showAxisLabels, color: '#bcd0df', hideOverlap: true },
      },
      series: series.map((entry, index) => ({
        id: entry.id,
        name: entry.label,
        type: 'bar' as const,
        coordinateSystem: 'polar' as const,
        barWidth: `${radial.barWidth}%`,
        barGap: '-100%',
        itemStyle: { color: color(entry) },
        label: {
          show: native.showLabel,
          position: 'outside' as const,
          formatter: (params: any) => format(params.value, entry),
        },
        tooltip: { valueFormatter: (value: any) => format(value, entry) },
        data: series.map((_other, dataIndex) => (dataIndex === index ? nativeNumber(entry.latest?.value) : null)),
      })),
    };
  }
  if (['timeseries', 'valueChart', 'bar', 'range', 'aggregate', 'state'].includes(native.family)) {
    const axes = native.chart.axes.length
      ? native.chart.axes
      : [{ id: 'default', label: '', position: 'left' as const, min: null, max: null }];
    const entries = series.filter((entry) => entry.key.type === 'timeseries');
    const plots: any[] = entries.map((entry) => {
      const setting = nativeSeriesSettings(entry.key, native);
      const axisIndex = Math.max(
        0,
        axes.findIndex((axis) => axis.id === setting.axisId),
      );
      return {
        id: entry.id,
        name: entry.label,
        type: setting.type,
        yAxisIndex: axisIndex,
        stack:
          native.family !== 'state' && native.chart.stack && setting.type !== 'scatter'
            ? `axis-${axisIndex}`
            : undefined,
        smooth: setting.smooth,
        step: setting.step,
        showSymbol: setting.showPoints,
        symbolSize: setting.pointSize,
        connectNulls: false,
        itemStyle: { color: entry.key.color || '#6ce9ff' },
        lineStyle: { width: setting.lineWidth },
        areaStyle: setting.area ? { opacity: native.family === 'range' ? native.range.fillOpacity : 0.2 } : undefined,
        label: {
          show: setting.showLabel,
          position: 'top',
          formatter: (params: any) => format(params.value?.[1], entry),
        },
        tooltip: { valueFormatter: (value: any) => format(value, entry) },
        data: (native.family === 'state' ? nativeStatePoints(entry, native.state, window) : entry.points).map(
          (point) => ({
            value: [point.ts, nativeNumber(point.value)],
            itemStyle: { color: color(entry, point.value) },
          }),
        ),
      };
    });
    // Separate silent series make thresholds visible even when all telemetry series are hidden.
    axes.forEach((axis, index) => {
      if (native.family === 'state') {
        const labels = new Map<number, string>();
        native.state.states.forEach((state) => {
          if (!labels.has(state.value)) labels.set(state.value, state.label);
        });
        plots.push({
          id: `states-${axis.id}`,
          type: 'line',
          yAxisIndex: index,
          data: [],
          silent: true,
          tooltip: { show: false },
          markLine: {
            symbol: 'none',
            animation: false,
            data: [...labels].map(([value, label]) => ({
              yAxis: value,
              label: {
                formatter: () => label,
                position: axis.position === 'right' ? 'insideEndTop' : 'insideStartTop',
                color: '#bcd0df',
              },
              lineStyle: { color: 'rgba(200,220,255,.2)', type: 'solid' },
            })),
          },
        });
      }
      const thresholds = native.chart.thresholds.filter((item) => item.axisId === axis.id);
      if (native.family === 'range' && native.range.showBoundaries) {
        const bounds = new Set(
          native.thresholds
            .flatMap((item) => [item.from, item.to])
            .filter((value): value is number => value != null && Number.isFinite(value)),
        );
        bounds.forEach((value) => thresholds.push({ value, label: String(value), color: '#bcd0df', axisId: axis.id }));
      }
      if (thresholds.length)
        plots.push({
          id: `threshold-${axis.id}`,
          type: 'line',
          yAxisIndex: index,
          data: [],
          silent: true,
          markLine: {
            symbol: 'none',
            animation: false,
            data: thresholds.map((item) => ({
              yAxis: item.value,
              name: item.label,
              label: { formatter: item.label || String(item.value), position: 'insideEndTop' },
              lineStyle: { color: item.color },
            })),
          },
        });
    });
    return {
      ...base,
      legend: {
        ...legend,
        show: native.family !== 'range' && native.showLegend,
        data: entries.map((entry) => entry.label),
        selected: Object.fromEntries(
          entries.map((entry) => [entry.label, !nativeSeriesSettings(entry.key, native).hidden]),
        ),
      },
      tooltip: { show: native.chart.tooltip, trigger: 'axis', renderMode: 'richText', confine: true },
      grid: {
        left: native.showLegend && position === 'left' ? 150 : 48,
        right: native.showLegend && position === 'right' ? 150 : 24,
        top: native.showLegend && position === 'top' ? 40 : 20,
        bottom: (native.showLegend && position === 'bottom' ? 65 : 32) + (native.chart.dataZoom ? 32 : 0),
        containLabel: true,
      },
      xAxis: {
        type: 'time',
        min: window?.startTs,
        max: window?.endTs,
        axisLabel: { color: '#bcd0df', hideOverlap: true },
      },
      yAxis: axes.map((axis, index) => {
        const values =
          native.family === 'state'
            ? [
                ...native.state.states.map((state) => state.value),
                ...plots
                  .filter((plot) => plot.yAxisIndex === index)
                  .flatMap((plot) => plot.data.map((point: any) => point.value?.[1]))
                  .filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)),
              ]
            : [];
        const min = values.length ? Math.min(...values) : 0;
        const max = values.length ? Math.max(...values) : 1;
        const padding = (max - min || 1) * 0.12;
        return {
          id: axis.id,
          type: 'value',
          name: axis.label,
          position: axis.position,
          offset: axes.slice(0, index).filter((other) => other.position === axis.position).length * 55,
          min: axis.min ?? (native.family === 'state' ? min - padding : undefined),
          max: axis.max ?? (native.family === 'state' ? max + padding : undefined),
          scale: true,
          axisLabel: { show: native.family !== 'state', color: '#bcd0df' },
          splitLine: { show: native.family !== 'state' && index === 0, lineStyle: { color: 'rgba(200,220,255,.12)' } },
        };
      }),
      dataZoom: native.chart.dataZoom
        ? [
            { type: 'inside', filterMode: 'none' },
            { type: 'slider', filterMode: 'none', bottom: native.showLegend && position === 'bottom' ? 25 : 0 },
          ]
        : [],
      visualMap: native.thresholds.length
        ? entries.flatMap((entry, seriesIndex) =>
            nativeSeriesSettings(entry.key, native).type !== 'line'
              ? []
              : [
                  {
                    type: 'piecewise' as const,
                    show: native.family === 'range' && native.showLegend,
                    orient: verticalLegend ? ('vertical' as const) : ('horizontal' as const),
                    [position]: 0,
                    textStyle: { color: '#dae9f6' },
                    dimension: 1,
                    seriesIndex,
                    pieces: native.thresholds.map((threshold) => ({
                      label:
                        threshold.from == null
                          ? `< ${threshold.to}`
                          : threshold.to == null
                            ? `≥ ${threshold.from}`
                            : threshold.from === threshold.to
                              ? String(threshold.from)
                              : `${threshold.from} – ${threshold.to}`,
                      ...(threshold.from != null && threshold.from === threshold.to
                        ? { value: threshold.from }
                        : {
                            ...(threshold.from != null ? { gte: threshold.from } : {}),
                            ...(threshold.to != null ? { lt: threshold.to } : {}),
                          }),
                      color: threshold.color,
                    })),
                    outOfRange: {
                      color: native.family === 'range' ? native.range.outOfRangeColor : entry.key.color || '#6ce9ff',
                    },
                  },
                ],
          )
        : [],
      series: plots,
    };
  }
  if (native.family === 'latestBar') {
    const settings = native.latestBar;
    const category = {
      type: 'category' as const,
      data: series.map((entry) => entry.label),
      axisLabel: { show: settings.showAxisLabels, color: '#bcd0df', hideOverlap: true },
    };
    const value = {
      type: 'value' as const,
      min: settings.min ?? undefined,
      max: settings.max ?? undefined,
      axisLabel: { color: '#bcd0df' },
      splitLine: { lineStyle: { color: 'rgba(200,220,255,.12)' } },
    };
    return {
      ...base,
      grid: {
        left: native.showLegend && position === 'left' ? 150 : 32,
        right: native.showLegend && position === 'right' ? 150 : 32,
        top: native.showLegend && position === 'top' ? 45 : 25,
        bottom: native.showLegend && position === 'bottom' ? 50 : 25,
        containLabel: true,
      },
      xAxis: settings.horizontal ? value : category,
      yAxis: settings.horizontal ? category : value,
      series: series.map((entry, index) => ({
        id: entry.id,
        name: entry.label,
        type: 'bar' as const,
        barWidth: settings.barWidth,
        barGap: '-100%',
        itemStyle: { color: color(entry) },
        label: {
          show: native.showLabel,
          position: settings.horizontal ? ('right' as const) : ('top' as const),
          formatter: (params: any) => format(params.value, entry),
        },
        tooltip: { valueFormatter: (value: any) => format(value, entry) },
        data: series.map((_entry, dataIndex) => (dataIndex === index ? nativeNumber(entry.latest?.value) : null)),
      })),
    };
  }
  if (native.family === 'pie')
    return {
      ...base,
      title:
        native.pie.innerRadius > 0 && native.pie.showTotal
          ? {
              text: formatNativeValue(
                series.some((entry) => nativeNumber(entry.latest?.value) !== null && Number(entry.latest?.value) >= 0)
                  ? series.reduce((sum, entry) => sum + Math.max(0, nativeNumber(entry.latest?.value) ?? 0), 0)
                  : null,
                native.pie.totalDecimals,
                native.pie.totalUnits,
              ),
              subtext: native.pie.totalLabel,
              left:
                native.showLegend && position === 'right'
                  ? '35%'
                  : native.showLegend && position === 'left'
                    ? '65%'
                    : '50%',
              top: '43%',
              textAlign: 'center',
              textStyle: { fontSize: native.fontSize, color: '#dae9f6' },
              subtextStyle: { color: '#bcd0df' },
            }
          : undefined,
      series: [
        {
          type: 'pie',
          radius: [`${native.pie.innerRadius}%`, '70%'],
          center: ['50%', '55%'],
          left: native.showLegend && position === 'left' ? '30%' : 0,
          right: native.showLegend && position === 'right' ? '30%' : 0,
          clockwise: native.pie.clockwise,
          tooltip: {
            formatter: (params: any) => {
              const entry = series.find((item) => item.id === params.data?.id);
              return entry
                ? `${entry.label}\n${native.pie.showPercent ? `${params.percent}% · ` : ''}${format(params.value, entry)}`
                : '';
            },
          },
          stillShowZeroSum: false,
          label: {
            show: native.showLabel,
            color: '#dae9f6',
            formatter: (params: any) => {
              const entry = series.find((item) => item.id === params.data?.id);
              return entry
                ? `${entry.label}: ${native.pie.showPercent ? `${params.percent}%` : format(params.value, entry)}`
                : '';
            },
          },
          data: series
            .filter((entry) => nativeNumber(entry.latest?.value) !== null && Number(entry.latest?.value) >= 0)
            .map((entry) => ({
              id: entry.id,
              name: entry.label,
              value: Number(entry.latest?.value),
              itemStyle: { color: color(entry) },
            })),
        },
      ],
    };
  if (native.family === 'gauge') {
    const gauge = native.gauge;
    if (gauge.type === 'linear' || gauge.type === 'thermometer') {
      const vertical = gauge.type === 'thermometer' || gauge.direction === 'vertical';
      const valueAxis = {
        type: 'value' as const,
        min: native.min,
        max: native.max,
        splitNumber: gauge.splitNumber,
        axisLabel: { show: gauge.showTicks, color: '#bcd0df' },
        splitLine: { show: gauge.showTicks, lineStyle: { color: 'rgba(200,220,255,.12)' } },
      };
      const categoryAxis = {
        type: 'category' as const,
        data: series.map((entry) => entry.label),
        axisLabel: {
          show: native.showLabel,
          color: native.presentation.labelColor,
          fontSize: native.presentation.labelFontSize,
        },
      };
      return {
        ...base,
        legend: { show: false },
        grid: { left: 20, right: 30, top: 30, bottom: 20, containLabel: true },
        xAxis: vertical ? categoryAxis : valueAxis,
        yAxis: vertical ? valueAxis : categoryAxis,
        series: [
          {
            type: 'bar',
            barWidth: gauge.width,
            showBackground: true,
            backgroundStyle: { color: 'rgba(200,220,255,.16)', borderRadius: gauge.type === 'thermometer' ? 30 : 0 },
            label: {
              show: native.presentation.showValue,
              position: vertical ? 'top' : 'right',
              color: native.presentation.valueColor || '#dae9f6',
              fontSize: native.fontSize,
              formatter: (params: any) => format(params.value, series[params.dataIndex]),
            },
            data: series.map((entry) => ({
              value: nativeNumber(entry.latest?.value),
              itemStyle: { color: color(entry), borderRadius: gauge.type === 'thermometer' ? 30 : 0 },
            })),
          },
        ],
      };
    }
    return {
      ...base,
      legend: { show: false },
      series: series.map((entry, index) => ({
        id: entry.id,
        name: entry.label,
        type: 'gauge',
        min: native.min,
        max: native.max,
        startAngle: gauge.startAngle,
        endAngle: gauge.endAngle,
        splitNumber: gauge.splitNumber,
        center: [`${((index + 0.5) / series.length) * 100}%`, '55%'],
        radius: `${Math.min(80, 170 / series.length)}%`,
        itemStyle: { color: color(entry) },
        axisLine: { lineStyle: { width: gauge.width, color: [[1, 'rgba(200,220,255,.16)']] } },
        axisTick: { show: gauge.showTicks },
        splitLine: { show: gauge.showTicks, length: 8, lineStyle: { color: '#8198ac' } },
        axisLabel: { show: gauge.showTicks, color: '#bcd0df', fontSize: 10 },
        pointer: { show: gauge.showPointer },
        progress: { show: true, width: gauge.width, roundCap: gauge.type === 'arc' },
        title: {
          show: native.showLabel,
          color: native.presentation.labelColor,
          fontSize: native.presentation.labelFontSize,
          offsetCenter: [0, '90%'],
        },
        detail: {
          show: native.presentation.showValue,
          color: native.presentation.valueColor || color(entry),
          fontSize: native.fontSize,
          formatter: (value: number) => format(value, entry),
        },
        data:
          nativeNumber(entry.latest?.value) === null ? [] : [{ name: entry.label, value: Number(entry.latest?.value) }],
      })),
    };
  }
  return base;
}
