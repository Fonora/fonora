/**
 * Critical V2 collision test groups, English minimal pairs for vowel-plane evaluation.
 */
export const V2_COLLISION_GROUPS = [
  {
    id: 'cat-cot-cut',
    label: 'cat / cot / cut',
    words: ['cat', 'cot', 'cut'],
  },
  {
    id: 'bad-bod-bud',
    label: 'bad / bod / bud',
    words: ['bad', 'bod', 'bud'],
  },
  {
    id: 'hat-hot',
    label: 'hat / hot',
    words: ['hat', 'hot'],
  },
  {
    id: 'man-mom',
    label: 'man / mom',
    words: ['man', 'mom'],
  },
  {
    id: 'father-palm-car',
    label: 'father / palm / car',
    words: ['father', 'palm', 'car'],
  },
];

export function allV2CollisionWords() {
  return V2_COLLISION_GROUPS.flatMap((g) => g.words);
}
