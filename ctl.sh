#!/bin/env bash

function_to_run=$1

API_ENDPOINT="http://localhost:3000"

function _timestamp {
	date +"%H:%M:%S.%3N"
}

function _log() {
	local message=$1
	prefix="$(_timestamp): "
	# shellcheck disable=2001
	echo "$message" | sed "s/.*/$prefix&/" 1>&2
}

function _debug() {
	local message=$1
	_log "$message"
}

function api() {
	local method=$1
	local resource=$2

	local agent="curl"
	args=(
		"--silent"
		"$API_ENDPOINT/v1/$resource"
		-X "$method"
		-H 'content-type: application/json'
	)

	if [[ $method == "POST" ]]; then
		args+=("--data-raw" "$json")
	fi

	local command_string="$agent ${args[*]}"

	_debug "API request: \`$command_string'"

	result=$("$agent" "${args[@]}" 2>&1)
	_log "API repsonse: $result"
}

function measure() {
	local type=$1
	local limit=$2
	json=$(
		echo -n '{'
		echo -n '"measurement": {"type": "'"""$type"'", "target": "google.com"}, '
		echo -n '"locations": [], '
		echo -n '"limit": '"$limit"
		echo -n '}'
	)
	api "POST" "measurements" "$json"
}

function ping() {
	local quantity=${1-1}
	measure "ping" "$quantity"
}

function stress() {
	local loops=$1
	local interval=$2
	shift
	shift
	local command=("$@")

	_debug "Starting stress test for '""${command[*]}': $loops runs at $interval interval"

	for ((i = 1; i <= loops; i++)); do
		if [[ $interval -gt "0" ]]; then
			"${command[@]}"
		else
			# If the intervael is negative then run the API request in the background, basically
			# we don't wait for its response. This should introduce greater stress
			"${command[@]}" &
		fi
		sleep "${interval//-/}"
	done
}

if [[ $(type -t "$function_to_run") != function ]]; then
	echo "Subcommand: '""$function_to_run' not found."
	exit 1
fi

shift
"""$function_to_run" """$@"
