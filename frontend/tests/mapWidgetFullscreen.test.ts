import assert from 'node:assert/strict';
import { moveMapWidgetToFullscreen, restoreMapWidgetFromFullscreen } from '../src/views/tb/map/mapWidgetFullscreen';

class FakeNode {
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] || null : null;
  }

  appendChild(child: FakeNode) {
    child.parentNode?.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore(child: FakeNode, reference: FakeNode | null) {
    child.parentNode?.removeChild(child);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }
    child.parentNode = this;
    return child;
  }

  removeChild(child: FakeNode) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
}

function asElement(node: FakeNode) {
  return node as unknown as HTMLElement;
}

function testMovesAndRestoresTheSameContentAtItsOriginalPosition() {
  const origin = new FakeNode();
  const before = new FakeNode();
  const content = new FakeNode();
  const after = new FakeNode();
  const host = new FakeNode();
  const trigger = new FakeNode();
  origin.appendChild(before);
  origin.appendChild(content);
  origin.appendChild(after);

  const session = moveMapWidgetToFullscreen({
    widgetId: 'widget-1',
    content: asElement(content),
    host: asElement(host),
    triggerElement: asElement(trigger),
  });

  assert.deepEqual(origin.children, [before, after]);
  assert.deepEqual(host.children, [content]);
  assert.equal(session.content, asElement(content));
  assert.equal(session.triggerElement, asElement(trigger));

  assert.equal(restoreMapWidgetFromFullscreen(session), true);
  assert.deepEqual(origin.children, [before, content, after]);
  assert.deepEqual(host.children, []);
  assert.equal(content.parentNode, origin);
}

function testRestoreIsIdempotent() {
  const origin = new FakeNode();
  const content = new FakeNode();
  const host = new FakeNode();
  origin.appendChild(content);

  const session = moveMapWidgetToFullscreen({
    widgetId: 'widget-2',
    content: asElement(content),
    host: asElement(host),
  });

  assert.equal(restoreMapWidgetFromFullscreen(session), true);
  assert.equal(restoreMapWidgetFromFullscreen(session), false);
  assert.deepEqual(origin.children, [content]);
}

function testRestoreFallsBackToTheOriginEndWhenTheFollowingSiblingDisappears() {
  const origin = new FakeNode();
  const content = new FakeNode();
  const after = new FakeNode();
  const replacement = new FakeNode();
  const host = new FakeNode();
  origin.appendChild(content);
  origin.appendChild(after);

  const session = moveMapWidgetToFullscreen({
    widgetId: 'widget-3',
    content: asElement(content),
    host: asElement(host),
  });
  origin.removeChild(after);
  origin.appendChild(replacement);

  restoreMapWidgetFromFullscreen(session);
  assert.deepEqual(origin.children, [replacement, content]);
}

testMovesAndRestoresTheSameContentAtItsOriginalPosition();
testRestoreIsIdempotent();
testRestoreFallsBackToTheOriginEndWhenTheFollowingSiblingDisappears();

console.log('map widget fullscreen tests passed');
