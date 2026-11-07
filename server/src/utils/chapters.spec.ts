import { extractChapters } from 'src/utils/chapters.js';

describe('extractChapters', () => {
  it.each([undefined, null, {}, 'chapters'])('ignores invalid chapter collections: %s', (input) => {
    expect(extractChapters(input, 10)).toEqual([]);
  });

  it('sorts chapters, limits them to the video duration and preserves titles', () => {
    expect(
      extractChapters(
        [
          { start_time: '5.125', end_time: '12', 'TAG:title': String.raw`雪 = \nHello\\World` },
          { start_time: 0, end_time: 5.125, 'TAG:title': '  Intro  ' },
        ],
        10,
      ),
    ).toEqual([
      { startTime: 0, endTime: 5.125, title: 'Intro' },
      { startTime: 5.125, endTime: 10, title: '雪 = \nHello\\World' },
    ]);
  });

  it('preserves valid chapters without titles or a known duration', () => {
    expect(extractChapters([{ start_time: '1', end_time: '2' }], 0)).toEqual([
      { startTime: 1, endTime: 2, title: null },
    ]);
    expect(extractChapters([{ start_time: 1, end_time: 2, 'TAG:title': 42 }], NaN)).toEqual([
      { startTime: 1, endTime: 2, title: null },
    ]);
  });

  it('ignores malformed chapters and duplicate starts without losing valid entries', () => {
    expect(
      extractChapters(
        [
          null,
          {},
          { start_time: '', end_time: 1 },
          { start_time: null, end_time: 1 },
          { start_time: 'N/A', end_time: 1 },
          { start_time: -1, end_time: 1 },
          { start_time: 1, end_time: Infinity },
          { start_time: 2, end_time: 1 },
          { start_time: 1, end_time: 1 },
          { start_time: 10, end_time: 11 },
          { start_time: 0, end_time: 1, 'TAG:title': ' '.repeat(3) },
          { start_time: 0, end_time: 2, 'TAG:title': 'Duplicate' },
        ],
        10,
      ),
    ).toEqual([{ startTime: 0, endTime: 1, title: null }]);
  });
});
