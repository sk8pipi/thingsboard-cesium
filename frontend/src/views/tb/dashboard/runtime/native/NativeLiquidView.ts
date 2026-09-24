import { defineComponent, getCurrentInstance, h, onMounted, ref, type PropType, type VNode } from 'vue';
import { liquidColor, liquidShapes, liquidValues } from './nativeLiquidCore';
import type { NativeLiquidSettings } from './nativeWidgetTypes';
import { nativeTimestamp } from './nativeWidgetSettings';
interface SvgNode {
  tag: string;
  attrs: Record<string, string | undefined>;
  children: SvgNode[];
}
export default defineComponent({
  name: 'NativeLiquidView',
  props: {
    settings: { type: Object as PropType<NativeLiquidSettings>, required: true },
    value: null,
    timestamp: { type: Number, default: null },
    decimals: { type: Number, default: 0 },
    fontSize: { type: Number, default: 24 },
    dateFormat: { type: String, default: 'locale' },
    now: { type: Number, default: Date.now },
    errors: { type: Array as PropType<string[]>, default: () => [] },
  },
  setup(props) {
    const id = `liquid-${getCurrentInstance()!.uid}-`;
    const mounted = ref(false);
    onMounted(() => {
      mounted.value = true;
    });
    return () => {
      const settings = props.settings;
      const data = props.errors.length ? null : liquidValues(props.value, settings);
      const shape = liquidShapes[settings.shape as keyof typeof liquidShapes] || liquidShapes['Vertical Cylinder'];
      const color = (key: 'tankColor' | 'liquidColor' | 'valueColor' | 'backgroundOverlayColor') =>
        liquidColor(settings[key], key === 'valueColor' ? (data?.value ?? null) : (data?.percent ?? null));
      const format = (value: number | undefined, precision = props.decimals) =>
        value == null ? '—' : value.toFixed(Math.max(0, Math.min(8, precision)));
      const tooltip = settings.showTooltip
        ? [
            data ? `${format(data.tooltip, settings.tooltipDecimals)} ${settings.tooltipUnits}` : '暂无有效液位',
            settings.showTooltipDate && props.timestamp != null
              ? nativeTimestamp(props.timestamp, props.dateFormat, props.now)
              : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : undefined;
      const render = (node: SvgNode): VNode => {
        const attrs: Record<string, any> = { ...node.attrs };
        for (const key of Object.keys(attrs))
          attrs[key] = attrs[key].replace(/url\(#([^)]*)\)/g, (_match: string, ref: string) => `url(#${id}${ref})`);
        if (attrs.id) attrs.id = id + attrs.id;
        // Original overlay filter would add a second blur layer; the widget host owns glass.
        delete attrs.filter;
        const classes = String(attrs.class || '').split(' ');
        const has = (name: string) => classes.includes(name);
        const style: Record<string, string> = {};
        if (has('tb-liquid-fill') || has('tb-liquid-surface')) {
          const property = has('tb-liquid-surface') && node.tag === 'ellipse' ? 'cy' : 'y';
          style[property] = `${data?.y ?? shape.empty}px`;
          style.transition = mounted.value && settings.animation ? `${property} 500ms ease` : 'none';
          if (!data) style.visibility = 'hidden';
        }
        if (has('tb-liquid')) attrs.fill = color('liquidColor');
        if (has('tb-shape-fill')) attrs.fill = props.errors.length ? '#cacaca' : color('tankColor');
        if (has('tb-shape-stroke')) attrs.stroke = props.errors.length ? '#cacaca' : color('tankColor');
        if (has('container-overlay') && settings.layout === 'simple') style.visibility = 'hidden';
        if (has('percentage-overlay') || has('absolute-overlay')) {
          const visible = settings.showOverlay && has(`${settings.layout}-overlay`);
          if (!visible) style.visibility = 'hidden';
          attrs.fill = color('backgroundOverlayColor');
          delete attrs['fill-opacity'];
        }
        if (node.tag === 'svg')
          Object.assign(attrs, {
            width: '100%',
            height: '100%',
            role: 'img',
            'aria-label': data ? `液位 ${format(data.percent)}%` : '暂无有效液位',
          });
        let children: VNode[] = node.children.map(render);
        if (node.tag === 'foreignObject') {
          if (!has(`${settings.layout}-value-container`)) style.visibility = 'hidden';
          else
            children = [
              h(
                'div',
                {
                  xmlns: 'http://www.w3.org/1999/xhtml',
                  style: {
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontFamily: 'sans-serif',
                    fontSize: `${props.fontSize}px`,
                    color: color('valueColor'),
                  },
                },
                [
                  h('span', `${format(data?.value)}${data ? ' ' + data.units : ''}`),
                  ...(settings.layout === 'absolute'
                    ? [
                        h(
                          'span',
                          {
                            style: {
                              borderTop: '1px solid currentColor',
                              fontSize: `${settings.volumeFontSize}px`,
                              color: settings.volumeColor,
                            },
                          },
                          format(data?.capacity),
                        ),
                      ]
                    : []),
                ],
              ),
            ];
        }
        attrs.style = {
          ...(typeof attrs.style === 'string'
            ? Object.fromEntries(
                attrs.style
                  .split(';')
                  .filter(Boolean)
                  .map((entry: string) => entry.split(':')),
              )
            : {}),
          ...style,
        };
        return h(node.tag, attrs, children);
      };
      return h(
        'div',
        {
          class: 'native-liquid',
          title: tooltip,
          style: { flex: '1', minHeight: '100px', height: '100%', overflow: 'hidden', position: 'relative' },
        },
        [
          render(shape.svg),
          ...(props.errors.length
            ? [
                h(
                  'div',
                  { role: 'status', style: { position: 'absolute', bottom: '0', color: '#ffb4a6', fontSize: '12px' } },
                  props.errors.join('；'),
                ),
              ]
            : []),
        ],
      );
    };
  },
});
