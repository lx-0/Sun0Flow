import { z } from "zod";

export type RouteOptions = {
  route?: string;
};

export type RouteSchemas<B, Q> = {
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
};

export type RoutePipelineOptions<B, Q> = RouteOptions & RouteSchemas<B, Q>;

export type SegmentData<P> = { params: Promise<P> };
