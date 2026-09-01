import assert from 'node:assert/strict';
import {
  DEFAULT_MAP_TEMPLATE_VIEWPORT,
  normalizeMapTemplateState,
  resolveMapTemplateViewportForLayout,
} from '../src/views/tb/map/mapTemplateConfig';
import { calculateMapScreenMetrics } from '../src/views/tb/map/mapScreenResponsive';

function closeTo(actual: number, expected: number, tolerance = 0.02) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
}

function testBaselineViewport() {
  const metrics = calculateMapScreenMetrics({
    width: 1920,
    height: 1080,
    topBar: { visible: true, height: 64 },
  });

  assert.equal(metrics.scale, 1);
  assert.equal(metrics.topBarHeight, 64);
  assert.equal(metrics.canvasWidth, 1920);
  assert.equal(metrics.canvasHeight, 1016);
  assert.equal(metrics.canvasLeft, 0);
  assert.equal(metrics.canvasTop, 64);
  assert.equal(metrics.columns, 12);
  assert.equal(metrics.rows, 25);
  assert.equal(metrics.margin, 10);
  closeTo(metrics.cellHeight, 31.04);
  assert.equal(metrics.compact, false);
  assert.equal(metrics.cesiumResolutionScale, 1);
}

function testMinimumDesktopViewport() {
  const metrics = calculateMapScreenMetrics({
    width: 1280,
    height: 720,
    topBar: { visible: true, height: 64 },
  });

  closeTo(metrics.scale, 2 / 3);
  assert.equal(metrics.topBarHeight, 44);
  assert.equal(metrics.canvasWidth, 1280);
  assert.equal(metrics.canvasHeight, 676);
  assert.equal(metrics.canvasTop, 44);
  assert.equal(metrics.compact, false);
  assert.ok(metrics.cellHeight > 20);
}

function testUltraWideViewportFillsWidgetCanvas() {
  const metrics = calculateMapScreenMetrics({
    width: 3440,
    height: 1440,
    topBar: { visible: true, height: 64 },
  });

  closeTo(metrics.scale, 4 / 3);
  assert.equal(metrics.canvasWidth, 3440);
  assert.equal(metrics.canvasLeft, 0);
  closeTo(metrics.canvasHeight, 1440 - 64 * (4 / 3));
  closeTo(metrics.canvasTop, 64 * (4 / 3));
}

function testFourKPixelBudgetAndFullWidgetCanvas() {
  const metrics = calculateMapScreenMetrics({
    width: 3840,
    height: 2160,
    topBar: { visible: true, height: 64 },
  });

  assert.equal(metrics.scale, 2);
  assert.equal(metrics.topBarHeight, 112);
  assert.equal(metrics.canvasWidth, 3840);
  assert.equal(metrics.canvasHeight, 2048);
  assert.equal(metrics.canvasLeft, 0);
  assert.equal(metrics.canvasTop, 112);
  closeTo(metrics.cesiumResolutionScale, 2 / 3);
}

function testEditorWideViewportDoesNotShrinkWidgets() {
  const metrics = calculateMapScreenMetrics({
    width: 1908,
    height: 894,
    topBar: { visible: true, height: 64 },
  });

  assert.equal(metrics.canvasWidth, metrics.containerWidth);
  assert.equal(metrics.canvasLeft, 0);
  closeTo(metrics.canvasTop, metrics.topBarHeight);
  closeTo(metrics.canvasHeight, metrics.containerHeight - metrics.topBarHeight);
}

function testRuntimeAndEditorUseOccupiedLayoutRows() {
  const layout = [
    { i: 'left-top', x: 0, y: 0, w: 3, h: 7 },
    { i: 'left-middle', x: 0, y: 7, w: 3, h: 6 },
    { i: 'left-bottom', x: 0, y: 13, w: 3, h: 8 },
    { i: 'removed-widget', x: 0, y: 40, w: 3, h: 8 },
  ];
  const viewport = resolveMapTemplateViewportForLayout(DEFAULT_MAP_TEMPLATE_VIEWPORT, layout, {
    'left-top': {},
    'left-middle': {},
    'left-bottom': {},
  });
  const metrics = calculateMapScreenMetrics({
    width: 1908,
    height: 956,
    viewport,
    topBar: { visible: true, height: 64 },
  });

  assert.equal(viewport.rows, 21);
  assert.equal(metrics.rows, 21);
  closeTo(metrics.rows * (metrics.cellHeight + metrics.margin) - metrics.margin, metrics.canvasHeight);
}

function testEmptyLayoutKeepsConfiguredRows() {
  const viewport = resolveMapTemplateViewportForLayout(DEFAULT_MAP_TEMPLATE_VIEWPORT, []);
  assert.equal(viewport.rows, 25);
}

function testCompactFallback() {
  const metrics = calculateMapScreenMetrics({ width: 900, height: 600, topBar: { visible: false } });
  assert.equal(metrics.compact, true);
  assert.equal(metrics.topBarHeight, 0);
  assert.ok(metrics.canvasWidth <= 900);
  assert.ok(metrics.canvasHeight <= 600);
}

function testLegacyTemplateMigration() {
  const normalized = normalizeMapTemplateState({
    version: 5,
    layout: [{ i: 'legacy', x: 0, y: 23, w: 4, h: 5 }],
  });

  assert.equal(normalized.version, 6);
  assert.equal(normalized.viewport.designWidth, 1920);
  assert.equal(normalized.viewport.designHeight, 1080);
  assert.equal(normalized.viewport.columns, 12);
  assert.equal(normalized.viewport.rows, 28);
  assert.equal(normalized.viewport.mode, 'fill');
  assert.deepEqual(normalized.layout, [{ i: 'legacy', x: 0, y: 23, w: 4, h: 5 }]);
}

testBaselineViewport();
testMinimumDesktopViewport();
testUltraWideViewportFillsWidgetCanvas();
testFourKPixelBudgetAndFullWidgetCanvas();
testEditorWideViewportDoesNotShrinkWidgets();
testRuntimeAndEditorUseOccupiedLayoutRows();
testEmptyLayoutKeepsConfiguredRows();
testCompactFallback();
testLegacyTemplateMigration();

console.log('map screen responsive tests passed');
