const e = React.createElement
const v = React.useState

window.onload = () => {
	ReactDOM.render(
		e(App),
		document.getElementById("root")
	)
}

let setQuery = () => {}
function initMap() {
	window.addEventListener("load", () => {
		const map = new google.maps.Map(document.getElementById("map"), {
			center: {lat: 0, lng: 0},
			zoom: 2,
		})
		map.addListener("click", async (mapsMouseEvent) => {
			const {lat, lng} = mapsMouseEvent.latLng.toJSON()
			const geoloc = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyAMUfM0uP0b6WmdKOjagLDyuEPJXCuqALo`, {
				method: "POST",
			})).json()
			const countryCode = geoloc.results[0]?.address_components?.find(x => x.types.includes("country"))?.short_name
			if (!countryCode) {
				return
			}
			const radios = await (await fetch(`https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/${countryCode}`)).json()
			setQuery(radios)
		})
	})
}

async function loadAudio() {
	const audio = document.getElementById("radio")
	await audio.load()
	audio.play()
}

const App = ({}) => {
	const [channel, setChannel] = v()
	return e("div", {className: "container"},
		e(ChatOverlay, {channel}),
		e(UserOverlay, {}),
		e(MainPanel, {channel, setChannel}),
		e("audio", {id: "radio", src: channel?.url_resolved, preload: "", autoplay: ""}),
	)
}

let relay
let setChats
const ChatOverlay = ({channel}) => {
	const [chats, setter] = v([])
	setChats = setter
	React.useEffect(() => {
		relay?.close()
		const protocol = "ws" + location.protocol.substr(4)
		relay = new WebSocket(`${protocol}//${location.host}/chat?id=${channel ? channel.stationuuid : 0}`)
		relay.addEventListener("message", event => {
			console.log(event.data)
			const newChat = JSON.parse(event.data)
			setChats(chats => [newChat, ...chats])
		})
		/*return function cleanup() {
			relay.close()
		}*/
	}, [channel])
	return e("div", {className: "chat-overlay"},
		e("div", {className: "chat-inner"},
			e("input", {onKeyDown: (e) => {
				if (e.key == "Enter") {
					e.preventDefault()
					relay?.send(JSON.stringify(e.target.value))
					e.target.value = ""
				}
			}}),
			chats.map(chat => e("div", {key: chat.id, className: "chat-row"},
				e("span", {className: "chat-user"}, chat.user),
				e("span", {className: "chat-message"}, chat.message),
				//e("span", {className: "chat-datetime"}, chat.datetime),
			)),
		),
	)
}

let username, password
const invalid = {}
const UserOverlay = ({}) => {
	const [user, setUser] = v()
	React.useEffect(async () => {
		const name = await fetch("/user")
		setUser(name.ok ? await name.json() : invalid)
	})
	return e("div", {className: "user-overlay"},
		user && (user != invalid ? e("div", {className: "user-inner name"}, user) :
		e("div", {className: "user-inner"},
			e("input", {placeholder: "username", onChange: (e) => {
				username = JSON.stringify(e.target.value)
			}}),
			e("input", {placeholder: "password", onKeyDown: (e) => {
				password = e.target.value
			}}),
			e("div", {},
				e("button", {onClick: () => {
					if (!username || username.length == 0 || !password) {
						return
					}
					const anchor = document.createElement('a')
					anchor.href = `/register?name=${username}&password=${password}`
					anchor.click()
				}}, "Register"),
				e("button", {onClick: () => {
					if (!username || username.length == 0 || !password) {
						return
					}
					const anchor = document.createElement('a')
					anchor.href = `/login?name=${username}&password=${password}`
					anchor.click()
				}}, "Login"),
			),
		)),
	)
}

const MainPanel = ({channel, setChannel}) => {
	return e("div", {className: "main-panel"},
		e("div", {id: "map", className: "map-frame"}),
		e(StationPicker, {setChannel}),
		e("div", {className: "current-channel-label"},
			e("div", {className: "current-channel-label-inner"}, channel ? channel.name : "[nothing playing]"),
		),
	)
}
const StationPicker = ({setChannel}) => {
	const [query, setter] = v()
	setQuery = setter
	return e("div", {className: "station-picker", style: {display: query ? "" : "none"}},
		e("div", {className: "station-picker-inner"},
			query?.map(qChannel => e(StationOption, {qChannel, setChannel})),
		),
		e("div", {className: "station-picker-close", onClick: () => {
			setQuery()
		}}, "×"),
	)
}
const StationOption = ({qChannel, setChannel}) => {
	return e("div", {key: qChannel.stationuuid, className: "station-picker-option"},
		e("span", {className: "station-picker-play", onClick: () => {
			setChannel(qChannel)
			setQuery()
		}}, "▶"),
		e("span", {}, qChannel.name),
	)
}
