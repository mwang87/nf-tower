import { Injectable } from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Workflow} from "../entity/workflow/workflow";
import {environment} from "../../../../environments/environment";
import {Observable, Subject, of, ReplaySubject, BehaviorSubject} from "rxjs";
import {map, tap} from "rxjs/operators";
import {Task} from "../entity/task/task";
import {findIndex, sortBy} from "lodash";


const endpointUrl: string = `${environment.apiUrl}/workflow`;

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {

  private workflowsByIdCache: Map<string | number, Workflow>;
  private workflowsSubject: Subject<Workflow[]>;

  constructor(private http: HttpClient) {
    this.workflowsByIdCache = new Map();
    this.workflowsSubject = new ReplaySubject(1);
  }


  get workflows$(): Observable<Workflow[]> {
    if (this.isWorkflowsCacheEmpty()) {
      console.log('Initializing workflows');
      this.requestWorkflowList().subscribe((workflows: Workflow[]) => this.workflowsSubject.next(workflows));
    } else {
      console.log('Getting workflows from cache');
      this.emitWorkflowsFromCache();
    }

    return this.workflowsSubject.asObservable();
  }

  private requestWorkflowList(): Observable<Workflow[]> {
    const url: string = `${endpointUrl}/list`;

    return this.http.get(url).pipe(
      map((data: any) => data.workflows ? data.workflows.map((item: any) => new Workflow(item)).sort((w1: Workflow, w2: Workflow) =>  (w1.data.start < w2.data.start) ? 1 : ((w1.data.start > w2.data.start) ? -1 : 0))  : []),
      tap((workflows: Workflow[]) => workflows.forEach((workflow: Workflow) => this.workflowsByIdCache.set(workflow.data.workflowId, workflow)))
    );
  }

  getWorkflow(id: string | number, bypassCache: boolean = false): Observable<Workflow> {
    if (!bypassCache && !this.isWorkflowsCacheEmpty()) {
      console.log(`Getting workflow ${id} from cache`);
      let workflow: Workflow = this.workflowsByIdCache.get(id);
      if (workflow) {
        return of(workflow);
      }
    }

    return this.requestWorkflow(id);
  }

  private requestWorkflow(id: string | number): Observable<Workflow> {
    console.log(`Requesting workflow ${id}`);
    const url: string = `${endpointUrl}/${id}`;

    return this.http.get(url).pipe(
      map((data: any[]) => new Workflow(data)),
      tap((workflow: Workflow) => this.workflowsByIdCache.set(workflow.data.workflowId, workflow))
    );
  }

  fetchTasks(workflow: Workflow): Observable<Task[]> {
    let tasks$: ReplaySubject<Task[]> = new ReplaySubject(1);
    this.requestTasks(workflow).subscribe((tasks: Task[]) => {
      tasks$.next(tasks)
    });

    return tasks$.asObservable();
  }

  private requestTasks(workflow: Workflow): Observable<Task[]> {
    console.log(`Requesting tasks of workflow ${workflow.data.workflowId}`);
    const url: string = `${endpointUrl}/${workflow.data.workflowId}/tasks`;

    return this.http.get(url).pipe(
      map((data: any) => data.tasks ? data.tasks.map((item) => new Task(item)) : []),
      tap((tasks: Task[]) => workflow.tasks = tasks)
    );
  }

  updateWorkflow(newWorkflow: Workflow, oldWorkflow: Workflow): void {
    newWorkflow.tasks = oldWorkflow.tasks;

    this.workflowsByIdCache.set(newWorkflow.data.workflowId, newWorkflow);
    this.emitWorkflowsFromCache();
  }

  updateTask(task: Task, workflow: Workflow): void {
    const taskIndex: number = findIndex(workflow.tasks, (t: Task) => t.data.taskId == task.data.taskId);
    if (taskIndex < 0) {
      workflow.tasks.push(task);
    } else {
      workflow.tasks[taskIndex] = task;
    }
    workflow.progress = task.progress;

    workflow.tasks = sortBy(Array.from(workflow.tasks), (t: Task) => t.data.taskId);
  }

  private emitWorkflowsFromCache(): void {
    this.workflowsSubject.next(Array.from(this.workflowsByIdCache.values()));
  }

  private isWorkflowsCacheEmpty(): boolean {
    return (this.workflowsByIdCache.size === 0);
  }

}
