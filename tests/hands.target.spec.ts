// Which button did the person mean? Plain geometry, no browser.
import { expect, test } from '@playwright/test';
import { pickNearest } from '../src/hands/steady/target';

const box = (id: string, x: number, y: number, width = 100, height = 40) => ({ id, rect: { x, y, width, height } });

test('a point inside a button picks that button', () => {
  expect(pickNearest({ x: 50, y: 20 }, [box('a', 0, 0), box('b', 200, 0)])).toEqual({ id: 'a', distance: 0 });
});

test('a point a little outside picks the button it is near', () => {
  const hit = pickNearest({ x: 112, y: 20 }, [box('a', 0, 0), box('b', 300, 0)]);
  expect(hit?.id).toBe('a');
  expect(hit?.distance).toBe(12);
});

test('a point too far from every button picks nothing', () => {
  expect(pickNearest({ x: 160, y: 20 }, [box('a', 0, 0), box('b', 300, 0)])).toBeNull();
});

test('two buttons about equally near: it does not guess', () => {
  // 10 px right of "a" (ends at x=100) and 10 px left of "b" (starts at x=120)
  expect(pickNearest({ x: 110, y: 20 }, [box('a', 0, 0), box('b', 120, 0)])).toBeNull();
});

test('clearly nearer to one of two buttons picks that one', () => {
  const hit = pickNearest({ x: 104, y: 20 }, [box('a', 0, 0), box('b', 130, 0)]);
  expect(hit?.id).toBe('a');
});

test('inside a small link that sits inside a big button picks the link', () => {
  const hit = pickNearest({ x: 20, y: 10 }, [box('big', 0, 0, 300, 100), box('link', 10, 5, 40, 12)]);
  expect(hit?.id).toBe('link');
});

test('reach can be changed', () => {
  expect(pickNearest({ x: 130, y: 20 }, [box('a', 0, 0)], 40)?.id).toBe('a');
  expect(pickNearest({ x: 130, y: 20 }, [box('a', 0, 0)], 20)).toBeNull();
});

test('no buttons: nothing', () => {
  expect(pickNearest({ x: 5, y: 5 }, [])).toBeNull();
});
