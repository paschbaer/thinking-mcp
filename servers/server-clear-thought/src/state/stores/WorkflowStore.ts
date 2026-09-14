import { BaseStore } from './BaseStore.js';

/** Navigation state for one recipe run of `recipe_runner` (track C). */
export interface RecipeProgress {
  recipeId: string;
  stageIndex: number;
}

/** Stores recipe run progress per recipe id — session-scoped. */
export class WorkflowStore extends BaseStore<RecipeProgress> {
  constructor() {
    super('workflow');
  }

  add(id: string, item: RecipeProgress): void {
    this.data.set(id, item);
  }

  getAll(): RecipeProgress[] {
    return [...this.data.values()];
  }

  clear(): void {
    this.data.clear();
  }

  remove(id: string): void {
    this.data.delete(id);
  }
}
