import Joi from 'joi';
import config from 'config';
import geoLists from 'countries-list';
import {states} from '../../lib/location/states.js';
import {regions} from '../../lib/location/regions.js';
import {dnsSchema, pingSchema, tracerouteSchema} from './command-schema.js';

const {continents, countries} = geoLists;
const measurementConfig = config.get<{limits: {global: number; location: number}}>('measurement');

export const createMeasurementSchema = Joi.object({
	locations: Joi.array().items(Joi.object({
		type: Joi.string().valid('continent', 'region', 'country', 'state', 'city', 'asn').required(),
		value: Joi.alternatives().conditional('type', {
			switch: [
				{
					is: 'continent',
					then: Joi.string().valid(...Object.keys(continents))
						.messages({'any.only': 'The continent must be a valid two-letter ISO code'}),
				},
				{is: 'region', then: Joi.string().valid(...Object.keys(regions))},
				{
					is: 'country',
					then: Joi.string().valid(...Object.keys(countries))
						.messages({'any.only': 'The country must be a valid two-letter ISO code'}),
				},
				{
					is: 'state',
					then: Joi.string().valid(...Object.keys(states))
						.messages({'any.only': 'The US state must be a valid two-letter code, e.g. CA'}),
				},
				{is: 'city', then: Joi.string().min(1).max(128)},
				{is: 'asn', then: Joi.number()},
			],
		}).required().messages({
			'any.required': 'Location value is required',
		}),
		limit: Joi.number().min(1).max(measurementConfig.limits.location).when(Joi.ref('/limit'), {
			is: Joi.exist(),
			then: Joi.forbidden().messages({'any.unknown': 'limit per location is not allowed when a global limit is set'}),
			otherwise: Joi.required().messages({'any.required': 'limit per location required when no global limit is set'}),
		}),
	})).default([]),
	measurement: Joi.alternatives().try(pingSchema, tracerouteSchema, dnsSchema).required(),
	limit: Joi.number().min(1).max(measurementConfig.limits.global),
});
