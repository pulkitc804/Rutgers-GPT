import { createRutgersIQStore } from "@rutgers-gpt/shared";
import { chromeLocalStorage } from "./chrome-storage";

export const useRutgersIQStore = createRutgersIQStore(chromeLocalStorage);
