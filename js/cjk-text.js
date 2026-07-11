const TRAILING_CJK_PUNCTUATION = /[，。！？；]+$/u;
const CJK_CHAR = /[\u4e00-\u9fff]/u;
const CJK_PUNCTUATION = /[，。！？；、：""''（）《》【】…—]/u;

/**
 * Mandarin lexicon for greedy longest-match segmentation.
 * Intl.Segmenter alone mis-splits idioms like 人人 and 生而.
 */
const ZH_LEXICON_WORDS = [
  '兄弟关系',
  '世界人权宣言',
  '相对待',
  '对待',
  '平等',
  '尊严',
  '权利',
  '理性',
  '良心',
  '一律',
  '精神',
  '关系',
  '兄弟',
  '人人',
  '他们',
  '我们',
  '你们',
  '自己',
  '人们',
  '人类',
  '生而',
  '自由',
  '具有',
  '赋予',
  '应该',
  '可以',
  '没有',
  '不是',
  '并且',
  '以及',
  '因为',
  '所以',
  '如果',
  '虽然',
  '但是',
  '什么',
  '这个',
  '那个',
  '这些',
  '那些',
  '一个',
  '一些',
  '所有',
  '每个',
  '国家',
  '政府',
  '法律',
  '社会',
  '世界',
  '中国',
  '人民',
  '生活',
  '工作',
  '学习',
  '时间',
  '问题',
  '发展',
  '建设',
  '实现',
  '进行',
  '成为',
  '作为',
  '通过',
  '根据',
  '为了',
  '关于',
  '对于',
  '由于',
  '已经',
  '正在',
  '将会',
  '可能',
  '必须',
  '需要',
  '希望',
  '认为',
  '表示',
  '知道',
  '看到',
  '听到',
  '说话',
  '告诉',
  '开始',
  '结束',
  '继续',
  '保持',
  '提供',
  '使用',
  '帮助',
  '支持',
  '保护',
  '尊重',
  '享有',
  '确保',
  '促进',
  '存在',
  '发生',
  '出现',
  '包括',
  '属于',
  '来自',
  '之间',
  '之后',
  '之前',
  '以后',
  '以前',
  '以上',
  '以下',
  '方面',
  '情况',
  '条件',
  '基础',
  '原则',
  '义务',
  '责任',
  '行为',
  '活动',
  '过程',
  '结果',
  '影响',
  '作用',
  '意义',
  '价值',
  '目标',
  '任务',
  '计划',
  '措施',
  '办法',
  '方式',
  '方法',
  '形式',
  '内容',
  '结构',
  '系统',
  '制度',
  '组织',
  '机构',
  '部门',
  '单位',
  '成员',
  '代表',
  '领导',
  '管理',
  '服务',
  '资源',
  '环境',
  '经济',
  '文化',
  '教育',
  '科学',
  '技术',
  '信息',
  '数据',
  '研究',
  '分析',
  '报告',
  '文件',
  '规定',
  '条例',
  '政策',
  '战略',
  '方案',
  '项目',
  '产品',
  '市场',
  '企业',
  '公司',
  '行业',
  '领域',
  '地区',
  '城市',
  '农村',
  '社区',
  '家庭',
  '个人',
  '赋',
  '有',
  '在',
  '和',
  '与',
  '及',
  '或',
  '但',
  '而',
  '且',
  '并',
  '以',
  '于',
  '为',
  '是',
  '了',
  '着',
  '过',
  '相',
  '应',
  '的',
  '之',
  '其',
  '所',
  '这',
  '那',
  '某',
  '各',
  '每',
  '另',
  '别',
  '本',
  '该',
  '此',
  '彼',
  '何',
];

const ZH_LEXICON = new Set(ZH_LEXICON_WORDS);
const ZH_MAX_LEXICON_LEN = ZH_LEXICON_WORDS.reduce((max, word) => Math.max(max, word.length), 0);

/** Split CJK text into clauses for Fonora rendering and word-by-word playback. */
export function splitCjkClauses(text, lang) {
  const pattern =
    lang === 'zh'
      ? /(?<=[。！？；，])/u
      : /(?<=[。！？])/u;
  return String(text || '')
    .split(pattern)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function stripTrailingCjkPunctuation(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(TRAILING_CJK_PUNCTUATION);
  return {
    text: match ? trimmed.slice(0, -match[0].length).trim() : trimmed,
    trailingPunctuation: match?.[0] || '',
  };
}

function longestLexiconMatch(text) {
  for (let len = Math.min(ZH_MAX_LEXICON_LEN, text.length); len >= 2; len -= 1) {
    const piece = text.slice(0, len);
    if (ZH_LEXICON.has(piece)) return piece;
  }
  return null;
}

function firstIntlWordSegment(text) {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return text.slice(0, 1);
  }

  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (isWordLike && segment.trim()) return segment;
  }

  return text.slice(0, 1);
}

function nextChineseSegment(text) {
  const trimmed = String(text || '');
  if (!trimmed) return '';

  const lexiconMatch = longestLexiconMatch(trimmed);
  if (lexiconMatch) return lexiconMatch;

  const firstChar = trimmed[0];
  if (CJK_PUNCTUATION.test(firstChar)) return firstChar;
  if (CJK_CHAR.test(firstChar)) return firstIntlWordSegment(trimmed);

  return firstChar;
}

function isSkippableChinesePunctuation(piece) {
  return piece.length === 1 && CJK_PUNCTUATION.test(piece);
}

/**
 * Insert spaces at Mandarin word boundaries.
 * Uses a lexicon for idioms like 人人 / 生而, then Intl.Segmenter for the rest.
 */
export function segmentChineseWords(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const parts = [];
  let index = 0;
  while (index < trimmed.length) {
    const rest = trimmed.slice(index);
    const piece = nextChineseSegment(rest);
    if (!piece.length) {
      index += 1;
      continue;
    }
    if (!isSkippableChinesePunctuation(piece)) {
      parts.push(piece);
    }
    index += piece.length;
  }

  return parts.join(' ');
}

/** Segment one Mandarin clause (trailing CJK punctuation is stripped before segmentation). */
export function segmentChineseClause(clause) {
  const { text: body } = stripTrailingCjkPunctuation(clause);
  return segmentChineseWords(body);
}

/** Count segmented words in a Mandarin clause. */
export function countChineseClauseWords(clause) {
  return segmentChineseClause(clause).split(/\s+/).filter(Boolean).length;
}

/**
 * Prepare Mandarin text for the IPA pipeline: clause split, then word segmentation.
 * @returns {{ spacedText: string, clauses: string[] }}
 */
export function prepareChineseForPipeline(text) {
  const clauses = splitCjkClauses(text, 'zh');
  const spacedClauses = clauses
    .map((clause) => segmentChineseClause(clause))
    .filter(Boolean);

  return {
    spacedText: spacedClauses.join(' '),
    clauses,
  };
}
