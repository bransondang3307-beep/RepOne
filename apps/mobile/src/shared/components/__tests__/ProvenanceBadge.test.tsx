import { StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ProvenanceBadge } from '../ProvenanceBadge';

// RO-023: on an iPhone the simulated-data warning ran past the screen edge. Jest has no layout engine, so this
// pins the layout contract that keeps the whole label visible: the badge may shrink to its container and its
// text wraps (no truncation).
function render(provenance: 'simulated' | 'replay' | 'sensor') {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<ProvenanceBadge provenance={provenance} />);
  });
  return tree;
}

describe('ProvenanceBadge', () => {
  it('shrinks to its container and lets the simulated-data warning wrap instead of clipping it', () => {
    const tree = render('simulated');
    const badge = StyleSheet.flatten(tree.root.findByType(View).props.style);
    expect(badge).toMatchObject({ flexShrink: 1, maxWidth: '100%' });
    expect(badge.borderRadius).toBeLessThan(999);
    const label = tree.root.findByType(Text);
    expect(label.props.children).toBe('Simulated data — not a real measurement');
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.ellipsizeMode).toBeUndefined();
  });

  it('keeps simulated and replayed data visually distinct from live sensor data', () => {
    const style = (p: 'simulated' | 'replay' | 'sensor') =>
      StyleSheet.flatten(render(p).root.findByType(View).props.style).backgroundColor;
    expect(style('simulated')).toBe(style('replay'));
    expect(style('simulated')).not.toBe(style('sensor'));
  });
});
