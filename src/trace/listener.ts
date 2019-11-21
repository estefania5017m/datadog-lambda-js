import { Context } from "aws-lambda";
import Tracer, { SpanContext, SpanOptions, TraceOptions } from "dd-trace";

import { extractTraceContext, readStepFunctionContextFromEvent, StepFunctionContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";

import { didFunctionColdStart } from "../utils/cold-start";
import { Source } from "./constants";

export interface TraceConfig {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * @default true.
   */
  autoPatchHTTP: boolean;
  /**
   * Whether to merge traces produced from dd-trace with X-Ray
   * @default false
   */
  mergeDatadogXrayTraces: boolean;
}

export class TraceListener {
  private contextService = new TraceContextService();
  private context?: Context;
  private stepFunctionContext?: StepFunctionContext;

  public get currentTraceHeaders() {
    return this.contextService.currentTraceHeaders;
  }
  constructor(private config: TraceConfig, private handlerName: string) {}

  public onStartInvocation(event: any, context: Context) {
    if (this.config.autoPatchHTTP) {
      patchHttp(this.contextService);
    }
    this.context = context;
    this.contextService.rootTraceContext = extractTraceContext(event);
    this.stepFunctionContext = readStepFunctionContextFromEvent(event);
  }

  public async onCompleteInvocation() {
    if (this.config.autoPatchHTTP) {
      unpatchHttp();
    }
  }

  public onWrap<T = (...args: any[]) => any>(func: T): T {
    const rootTraceContext = this.currentTraceHeaders;
    let spanContext: SpanContext | null = null;

    if (this.contextService.traceSource === Source.Event || this.config.mergeDatadogXrayTraces) {
      spanContext = Tracer.extract("http_headers", rootTraceContext);
    }

    const options: SpanOptions & TraceOptions = {};
    if (this.context) {
      options.tags = {
        cold_start: didFunctionColdStart(),
        function_arn: this.context.invokedFunctionArn,
        request_id: this.context.awsRequestId,
        resource_names: this.context.functionName,
      };
    }
    if (this.stepFunctionContext) {
      options.tags = {
        ...options.tags,
        ...this.stepFunctionContext,
      };
    }

    if (spanContext !== null) {
      options.childOf = spanContext;
    }
    options.resource = this.handlerName;
    return Tracer.wrap("aws.lambda", options, func);
  }
}
