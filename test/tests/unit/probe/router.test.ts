import * as sinon from 'sinon';
import _ from 'lodash';
import {expect} from 'chai';
import {RemoteSocket, Server} from 'socket.io';
import type {DefaultEventsMap} from 'socket.io/dist/typed-events.js';
import {ProbeRouter} from '../../../../src/probe/router.js';
import {PROBES_NAMESPACE, SocketData} from '../../../../src/lib/ws/server.js';
import type {DeepPartial} from '../../../types.js';
import type {ProbeLocation} from '../../../../src/probe/types.js';
import type {Location} from '../../../../src/lib/location/types.js';
import type {LocationWithLimit} from '../../../../src/measurement/types.js';
import {
	getCountryAliases,
	getCountryByIso,
	getCountryIso3ByIso2,
	getNetworkAliases,
	getRegionByCountry,
	getStateNameByIso,
} from '../../../../src/lib/location/location.js';

type Socket = RemoteSocket<DefaultEventsMap, SocketData>;

const buildLocationIndexes = (location: Partial<ProbeLocation>) => [
	...Object.entries(location)
		.filter(([key, value]) => value && !['asn', 'latitude', 'longitude'].includes(key))
		.map(entries => String(entries[1])),
	...(location.asn ? [`as${location.asn}`] : []),
	...(location.state ? [getStateNameByIso(location.state)] : []),
	...(location.country ? [
		getCountryByIso(location.country),
		getCountryIso3ByIso2(location.country),
		getCountryAliases(location.country),
	] : []),
	...(location.network ? [getNetworkAliases(location.network)] : []),
].flat().filter(Boolean).map(s => s.toLowerCase().replace('-', ' '));

const buildSocket = (
	id: string,
	location: Partial<ProbeLocation>,
	index: string[] = buildLocationIndexes(location),
	ready = true,
): DeepPartial<Socket> => ({
	id,
	data: {
		probe: {
			ready,
			location,
			index,
		},
	},
});

describe('probe router', () => {
	const sandbox = sinon.createSandbox();
	const wsServerMock = sandbox.createStubInstance(Server);
	const router = new ProbeRouter(wsServerMock);

	beforeEach(() => {
		sandbox.reset();

		wsServerMock.of.returnsThis();
	});

	describe('route with location limit', () => {
		it('should find probes for each location', async () => {
			const sockets: Array<DeepPartial<Socket>> = [
				buildSocket('socket-1', {continent: 'EU', country: 'UA'}),
				buildSocket('socket-2', {continent: 'EU', country: 'PL'}),
				buildSocket('socket-3', {continent: 'EU', country: 'PL'}),
				buildSocket('socket-4', {continent: 'NA', country: 'UA'}),
				buildSocket('socket-5', {continent: 'EU', country: 'PL'}),
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes([
				{type: 'country', value: 'UA', limit: 2},
				{type: 'country', value: 'PL', limit: 2},
			]);

			expect(wsServerMock.of.calledOnce).to.be.true;
			expect(wsServerMock.of.firstCall.firstArg).to.equal(PROBES_NAMESPACE);

			expect(probes.length).to.equal(4);
			expect(probes.filter(p => p.location.country === 'UA').length).to.equal(2);
			expect(probes.filter(p => p.location.country === 'PL').length).to.equal(2);
		});
	});

	describe('probe readiness', () => {
		it('should find 2 probes', async () => {
			const sockets: Array<DeepPartial<Socket>> = [
				buildSocket('socket-1', {continent: 'EU', country: 'GB'}, [], false),
				buildSocket('socket-2', {continent: 'EU', country: 'PL'}, [], false),
				buildSocket('socket-4', {continent: 'EU', country: 'GB'}),
				buildSocket('socket-5', {continent: 'EU', country: 'PL'}),
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes([
				{type: 'country', value: 'GB', limit: 2},
				{type: 'country', value: 'PL', limit: 2},
			]);

			expect(wsServerMock.of.calledOnce).to.be.true;
			expect(wsServerMock.of.firstCall.firstArg).to.equal(PROBES_NAMESPACE);

			expect(probes.length).to.equal(2);
			expect(probes.filter(p => p.location.country === 'GB').length).to.equal(1);
			expect(probes.filter(p => p.location.country === 'PL').length).to.equal(1);
		});
	});

	describe('route globally distributed', () => {
		type Socket = RemoteSocket<DefaultEventsMap, SocketData>;

		it('should find probes when each group is full', async () => {
			const sockets = ['AF', 'AS', 'EU', 'OC', 'NA', 'SA']
				.flatMap(continent => _.range(50).map(i => buildSocket(`${continent}-${i}`, {continent})));

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes([], 100);
			const grouped = _.groupBy(probes, 'location.continent');

			expect(probes.length).to.equal(100);
			expect(grouped['AF']?.length).to.equal(5);
			expect(grouped['AS']?.length).to.equal(15);
			expect(grouped['EU']?.length).to.equal(30);
			expect(grouped['OC']?.length).to.equal(10);
			expect(grouped['NA']?.length).to.equal(30);
			expect(grouped['SA']?.length).to.equal(10);
		});

		it('should find probes when some groups are not full', async () => {
			const sockets: DeepPartial<Socket[]> = [
				...(_.range(15).map(i => buildSocket(`AF-${i}`, {continent: 'AF'}))),
				...(_.range(15).map(i => buildSocket(`AS-${i}`, {continent: 'AS'}))),
				...(_.range(20).map(i => buildSocket(`EU-${i}`, {continent: 'EU'}))),
				...(_.range(10).map(i => buildSocket(`OC-${i}`, {continent: 'OC'}))),
				...(_.range(20).map(i => buildSocket(`NA-${i}`, {continent: 'NA'}))),
				...(_.range(30).map(i => buildSocket(`SA-${i}`, {continent: 'SA'}))),
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes([], 100);
			const grouped = _.groupBy(probes, 'location.continent');

			expect(probes.length).to.equal(100);
			expect(grouped['AF']?.length).to.equal(13);
			expect(grouped['AS']?.length).to.equal(15);
			expect(grouped['EU']?.length).to.equal(20);
			expect(grouped['OC']?.length).to.equal(10);
			expect(grouped['NA']?.length).to.equal(20);
			expect(grouped['SA']?.length).to.equal(22);
		});

		it('should find when probes not enough', async () => {
			const sockets: DeepPartial<Socket[]> = [
				...(_.range(15).map(i => buildSocket(`AF-${i}`, {continent: 'AF'}))),
				...(_.range(20).map(i => buildSocket(`EU-${i}`, {continent: 'EU'}))),
				...(_.range(10).map(i => buildSocket(`OC-${i}`, {continent: 'OC'}))),
				...(_.range(20).map(i => buildSocket(`NA-${i}`, {continent: 'NA'}))),
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes([], 100);
			const grouped = _.groupBy(probes, 'location.continent');

			expect(probes.length).to.equal(65);
			expect(grouped['AF']?.length).to.equal(15);
			expect(grouped['EU']?.length).to.equal(20);
			expect(grouped['OC']?.length).to.equal(10);
			expect(grouped['NA']?.length).to.equal(20);
		});
	});

	describe('route with global limit', () => {
		it('should find probes even in overlapping locations', async () => {
			const sockets: DeepPartial<Socket[]> = [
				...(_.range(10_000).map(i => buildSocket(`PL-${i}`, {continent: 'EU', country: 'PL'}))),
				...(_.range(1).map(i => buildSocket(`UA-${i}`, {continent: 'EU', country: 'UA'}))),
			];
			const locations: Location[] = [
				{type: 'continent', value: 'EU'},
				{type: 'country', value: 'UA'},
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes(locations, 100);
			const grouped = _.groupBy(probes, 'location.country');

			expect(probes.length).to.equal(100);
			expect(grouped['PL']?.length).to.equal(99);
			expect(grouped['UA']?.length).to.equal(1);
		});

		it('should evenly distribute probes', async () => {
			const sockets: DeepPartial<Socket[]> = [
				...(_.range(100).map(i => buildSocket(`PL-${i}`, {country: 'PL'}))),
				...(_.range(100).map(i => buildSocket(`UA-${i}`, {country: 'UA'}))),
				...(_.range(100).map(i => buildSocket(`NL-${i}`, {country: 'NL'}))),
			];
			const locations: Location[] = [
				{type: 'country', value: 'PL'},
				{type: 'country', value: 'UA'},
				{type: 'country', value: 'NL'},
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes(locations, 100);
			const grouped = _.groupBy(probes, 'location.country');

			expect(probes.length).to.equal(100);
			expect(grouped['PL']?.length).to.equal(34);
			expect(grouped['UA']?.length).to.equal(33);
			expect(grouped['NL']?.length).to.equal(33);
		});
	});

	describe('route with magic location', () => {
		const location = {
			continent: 'EU',
			region: getRegionByCountry('GB'),
			country: 'GB',
			state: undefined,
			city: 'london',
			asn: 5089,
			network: 'a-virgin media',
		};

		it('should return match (country alias)', async () => {
			const sockets: DeepPartial<Socket[]> = [
				buildSocket(String(Date.now()), location),
			];

			const locations: Location[] = [
				{type: 'magic', value: 'england'},
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes(locations, 100);

			expect(probes.length).to.equal(1);
			expect(probes[0]!.location.country).to.equal('GB');
		});

		it('should return match (magic nested)', async () => {
			const sockets: DeepPartial<Socket[]> = [
				buildSocket(String(Date.now()), location),
			];

			const locations: Location[] = [
				{type: 'magic', value: 'england+as5089'},
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes(locations, 100);

			expect(probes.length).to.equal(1);
			expect(probes[0]!.location.country).to.equal('GB');
		});

		describe('Location type - Network', () => {
			for (const testCase of ['a-virgin', 'virgin', 'media']) {
				it(`should match network - ${testCase}`, async () => {
					const sockets: DeepPartial<Socket[]> = [
						buildSocket(String(Date.now()), location),
					];

					const locations: Location[] = [
						{type: 'magic', value: testCase},
					];

					wsServerMock.fetchSockets.resolves(sockets as never);

					const probes = await router.findMatchingProbes(locations, 100);

					expect(probes.length).to.equal(1);
					expect(probes[0]!.location.country).to.equal('GB');
				});
			}
		});

		describe('Location type - ASN', () => {
			for (const testCase of ['5089', 'AS5089', 'as5089']) {
				it(`should match ASN - ${testCase}`, async () => {
					const sockets: DeepPartial<Socket[]> = [
						buildSocket(String(Date.now()), location),
					];

					const locations: Location[] = [
						{type: 'magic', value: testCase},
					];

					wsServerMock.fetchSockets.resolves(sockets as never);

					const probes = await router.findMatchingProbes(locations, 100);

					expect(probes.length).to.equal(1);
					expect(probes[0]!.location.country).to.equal('GB');
				});
			}
		});
	});

	describe('sticky filters', () => {
		const sockets: DeepPartial<Socket[]> = [
			buildSocket('GB-1', {continent: 'EU', country: 'GB', city: 'london', asn: 100}),
			buildSocket('FI-1', {continent: 'EU', country: 'FI', city: 'london', asn: 222}),
			buildSocket('US-1', {continent: 'NA', country: 'US', city: 'london', state: 'OH', asn: 999}),
			buildSocket('US-3', {continent: 'NA', country: 'US', city: 'london', state: 'AR', asn: 555}),
			buildSocket('CA-1', {continent: 'NA', country: 'CA', city: 'london', asn: 888}),
		];

		it('should combine filters', async () => {
			const locations: LocationWithLimit[] = [
				{type: 'city', value: 'london'},
				{type: 'country', value: 'US'},
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes(locations, 100, true);
			const grouped = _.groupBy(probes, 'location.country');

			expect(grouped['US']?.length).to.equal(2);
		});

		it('should combine filters - use magic', async () => {
			const locations: LocationWithLimit[] = [
				{type: 'city', value: 'london'},
				{type: 'magic', value: 'uk'},
			];

			wsServerMock.fetchSockets.resolves(sockets as never);

			const probes = await router.findMatchingProbes(locations, 100, true);
			const grouped = _.groupBy(probes, 'location.country');

			expect(grouped['GB']?.length).to.equal(1);
		});
	});
});
