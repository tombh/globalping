import type {Context} from 'koa';
import type Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import {getMeasurementRunner} from '../runner.js';
import type {MeasurementRequest} from '../types.js';
import {validate} from '../../lib/http/middleware/validate.js';
import {createMeasurementSchema} from '../schema/create-measurement.schema.js';
import appsignal from '../../lib/appsignal.js';

const runner = getMeasurementRunner();

const handle = async (ctx: Context) => {
	const request = ctx.request.body as MeasurementRequest;
	const config = await runner.run(request);

	ctx.body = {
		id: config.id,
		probesCount: config.probes.length,
	};
};

export const registerCreateMeasurementRoute = (router: Router): void => {
	router.post('/measurements', bodyParser(), validate(createMeasurementSchema), async ctx => {
		const rootSpan = appsignal.tracer().rootSpan();
		rootSpan.setName('POST /v1/measurements');

		const childSpan = rootSpan.child();
		childSpan.setCategory('process_request.koa');

		await handle(ctx).finally(() => childSpan.close());
	});
};
