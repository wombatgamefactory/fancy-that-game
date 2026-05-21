import { REWARD_CARDS } from './src/engine/tiles.js';

// Check for patterns that might be problematic
const singleTiles = REWARD_CARDS.filter(c => {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (c.pattern[i]) count++;
  }
  return count === 1;
});

const twoTiles = REWARD_CARDS.filter(c => {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (c.pattern[i]) count++;
  }
  return count === 2;
});

const threeTiles = REWARD_CARDS.filter(c => {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (c.pattern[i]) count++;
  }
  return count === 3;
});

const fourTiles = REWARD_CARDS.filter(c => {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (c.pattern[i]) count++;
  }
  return count === 4;
});

const fiveTiles = REWARD_CARDS.filter(c => {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (c.pattern[i]) count++;
  }
  return count === 5;
});

const sixTiles = REWARD_CARDS.filter(c => {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (c.pattern[i]) count++;
  }
  return count === 6;
});

console.log(`Single tile patterns: ${singleTiles.length}`);
console.log(`Two tile patterns: ${twoTiles.length}`);
console.log(`Three tile patterns: ${threeTiles.length}`);
console.log(`Four tile patterns: ${fourTiles.length}`);
console.log(`Five tile patterns: ${fiveTiles.length}`);
console.log(`Six tile patterns: ${sixTiles.length}`);

console.log('\nSample patterns:');
[singleTiles[0], twoTiles[0], threeTiles[0], fourTiles[0]].forEach(c => {
  if (c) console.log(`Card ${c.id}: ${c.name} - ${c.pattern}`);
});
