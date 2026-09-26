import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  nativeWidgetBundles,
  localBundleWidgets,
  serverBundles,
  mergeBrowseWidgets,
  mergeNativeBundles,
  filterBrowseWidgets,
  hiddenNativeWidgetFqns,
  isNativeWidgetVisible,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetBrowse';
import { safePreviewSource, createPreviewImageCache } from '../src/views/tb/widgetsLibrary/widgetResourceCore';
const directory = new URL('../../backend/application/src/main/data/json/system/widget_bundles/', import.meta.url);
const originals = fs
  .readdirSync(directory)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(fs.readFileSync(new URL(file, directory), 'utf8')));
assert.equal(hiddenNativeWidgetFqns.size, 34);
for (const { widgetsBundle, widgetTypeFqns } of originals) {
  const visibleFqns = widgetTypeFqns.filter(isNativeWidgetVisible);
  const bundle = nativeWidgetBundles.find((item) => item.alias === widgetsBundle.alias);
  if (!visibleFqns.length) {
    assert.equal(bundle, undefined, `${widgetsBundle.alias} 空包应隐藏`);
    continue;
  }
  assert.ok(bundle);
  assert.equal(bundle.image, widgetsBundle.image);
  assert.deepEqual(bundle.widgetTypeFqns, visibleFqns);
  assert.equal(localBundleWidgets(bundle).length, visibleFqns.length);
  assert.ok(safePreviewSource(bundle.image), bundle.alias);
}
const charts = localBundleWidgets(nativeWidgetBundles.find((b) => b.alias === 'charts'));
assert.equal(charts[0].fqn, 'time_series_chart');
assert.ok(charts.every((w) => w.image && safePreviewSource(w.image)));
assert.equal(filterBrowseWidgets(charts, 'time series chart', 'timeseries', 'current')[0].fqn, 'time_series_chart');
assert.ok(filterBrowseWidgets(charts, '', 'latest').every((w) => w.type === 'latest' && !w.deprecated));
const remote = serverBundles([
  { alias: 'cards', title: 'Cards', tenantId: { id: '00000000-0000-0000-0000-000000000000' }, id: { id: 'cards-id' } },
  { alias: 'private', tenantId: { id: 'tenant' } },
]);
assert.equal(remote.length, 1);
assert.equal(remote[0].id, 'cards-id');
const mergedBundles = mergeNativeBundles(remote);
assert.equal(mergedBundles.length, nativeWidgetBundles.length);
assert.equal(mergedBundles.find((bundle) => bundle.alias === 'cards')?.id, 'cards-id');
assert.equal(
  mergeNativeBundles([]).find((bundle) => bundle.alias === 'charts')?.widgetTypeFqns?.[0],
  'time_series_chart',
);
const localCharts = localBundleWidgets(nativeWidgetBundles.find((bundle) => bundle.alias === 'charts'));
const mergedWidgets = mergeBrowseWidgets(localCharts, []);
assert.equal(mergedWidgets.length, localCharts.length);
assert.equal(mergedWidgets[0].local, true);
assert.equal(mergedWidgets[0].fqn, 'time_series_chart');
const remoteFirst = mergeBrowseWidgets(localCharts, [
  { fqn: 'time_series_chart', name: 'Remote chart', id: { id: 'remote-id' } },
]);
assert.equal(remoteFirst.length, localCharts.length);
assert.equal(remoteFirst[0].name, 'Remote chart');
assert.equal(remoteFirst[0].local, false);
assert.equal(remoteFirst[0].image, localCharts[0].image);
assert.ok(localBundleWidgets().every((entry) => !hiddenNativeWidgetFqns.has(entry.fqn)));
assert.equal(
  mergeBrowseWidgets(
    [],
    [
      { fqn: 'map', name: 'Remote map' },
      { fqn: 'entity_count', name: 'Count' },
    ],
  ).length,
  1,
  '服务端结果也不能重新引入已排除部件',
);
assert.equal(
  safePreviewSource('tb-image:name:description;data:image/svg+xml;base64,PHN2Zy8+'),
  'data:image/svg+xml;base64,PHN2Zy8+',
);
assert.equal(safePreviewSource('tb-image;/api/images/system/a%20b.svg'), '/api/images/system/a%20b.svg');
for (const source of [
  '/api/images/system/%2e%2e',
  '/api/images/system/a%2fb',
  '/api/images/system/%252e',
  'https://untrusted/image.svg',
])
  assert.equal(safePreviewSource(source), '');
let calls = 0;
const cache = createPreviewImageCache(async () => {
  calls++;
  return new Blob(['image'], { type: 'image/png' });
});
const a = cache.acquire('image'),
  b = cache.acquire('image');
await Promise.all([a.promise, b.promise]);
assert.equal(calls, 1);
a.release();
b.release();
const c = cache.acquire('image');
await c.promise;
c.release();
assert.equal(calls, 2, '最后一个使用者卸载后释放图片缓存');
console.log('Native original bundles, image mapping, filtering and image cache passed');
