module.exports = {
	redis: {
		socket: {
			tls: false,
		},
	},
	measurement: {
		limits: {
			global: 10_000,
			location: 200,
		},
	},
};
