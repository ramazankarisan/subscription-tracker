// @vitest-environment jsdom
import {
  cacheKeyForUser,
  clearData,
  emptyData,
  loadData,
  saveData,
} from './storage';

describe('offline cache', () => {
  const key = cacheKeyForUser('user-1');
  const data = {
    ...emptyData,
    settings: { ...emptyData.settings, reminderLeadDays: 14 },
  };

  it('keeps one user per key', () => {
    saveData(key, data);
    expect(loadData(key)).toEqual(data);
    expect(loadData(cacheKeyForUser('user-2'))).toEqual(emptyData);
  });

  it('is gone after clearData (sign-out)', () => {
    saveData(key, data);
    clearData(key);
    expect(loadData(key)).toEqual(emptyData);
  });
});
