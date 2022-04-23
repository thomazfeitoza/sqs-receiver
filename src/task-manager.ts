import * as BluebirdPromise from 'bluebird';

type Task = BluebirdPromise<unknown>;
type TaskMap = { [id: string]: Task };

export default class TaskManager {

  private taskMap: TaskMap;

  constructor() {
    this.taskMap = {};
  }

  public add(id: string, task: unknown) {
    if (this.get(id)) {
      return;
    }

    this.taskMap[id] = BluebirdPromise.cast(task);
  }

  public getCount(): number {
    return Object.keys(this.taskMap).length;
  }

  public async waitOne() {
    const tasks = this.getAll();
    await Promise.race(tasks);
    this.cleanFinishedTasks();
  }

  public async waitAll() {
    const tasks = this.getAll();
    await Promise.allSettled(tasks);
    this.cleanFinishedTasks();
  }

  private get(id: string): Task | null {
    return this.taskMap[id];
  }

  private getAll(): Task[] {
    return Object.keys(this.taskMap).map((id) => this.taskMap[id]);
  }

  private cleanFinishedTasks(): void {
    const activeMap: TaskMap = {};
    Object.keys(this.taskMap).forEach((id) => {
      const task = this.taskMap[id];
      if (task.isPending()) {
        activeMap[id] = task;
      }
    });

    this.taskMap = activeMap;
  }

}