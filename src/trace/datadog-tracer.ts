import Tracer from "dd-trace";

export function initDatadogTracer() {
  Tracer.init({
    experimental: {
      useLogWriter: true,
    },
  });
}
