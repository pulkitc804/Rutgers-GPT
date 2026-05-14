import type { StateStorage } from "zustand/middleware";

export const chromeLocalStorage: StateStorage = {
  getItem: async (name) =>
    new Promise((resolve) => {
      chrome.storage.local.get(name, (r) => {
        const v = r[name];
        resolve(typeof v === "string" ? v : null);
      });
    }),
  setItem: async (name, value) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set({ [name]: value }, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve();
      });
    }),
  removeItem: async (name) =>
    new Promise((resolve) => {
      chrome.storage.local.remove(name, () => resolve());
    }),
};
