import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = Symbol('is-public');

/** Opts a route out of the global JWT guard (every route is protected by default). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
