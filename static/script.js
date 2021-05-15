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

let source
let setChats
const ChatOverlay = ({channel}) => {
	const [chats, setter] = v([])
	setChats = setter
	React.useEffect(() => {
		setChats([])
		source?.close()
		source = new EventSource(`/chat?id=${channel ? channel.stationuuid : 0}`)
		source.addEventListener("message", event => {
			const newChat = JSON.parse(event.data)
			setChats(chats => [newChat, ...chats])
		})
	}, [channel])
	return e("div", {className: "chat-overlay"},
		e("div", {className: "chat-inner"},
			e("input", {onKeyDown: (e) => {
				if (e.key == "Enter") {
					e.preventDefault()
					fetch(`/chat?id=${channel ? channel.stationuuid : 0}`, {
						method: "POST",
						headers: {"Content-Type": "text/plain"},
						body: JSON.stringify(e.target.value),
					})
					e.target.value = ""
				}
			}}),
			e("div", {}, e("em", {}, channel ? "chat with users listening to " + channel.name : "chat with other users")),
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
	const [state, setState] = v("")
	const [user, setUser] = v()
	const updateUser = async () => {
		if (!document.cookie.includes("verification")) {
			setUser(invalid)
			return
		}
		setState("")
		const name = await fetch("/user")
		setUser(name.ok ? await name.json() : invalid)
	}
	React.useEffect(updateUser, [])
	return e("div", {className: "user-overlay"},
		user && (user != invalid ?
		e("div", {className: "user-inner"},
			e("div", {className: "user-label"},
				e("span", {className: "user-name"}, user),
				e("button", {onClick: () => {
					setUser(invalid)
					document.cookie=`verification=;expires=${new Date(Date.now()).toUTCString()}`
				}}, "Logout"),
			),
		) :
		e("div", {className: "user-inner " + state},
			e("input", {name: "username", placeholder: "username", onChange: (e) => {
				username = JSON.stringify(e.target.value)
			}}),
			e("input", {name: "password", placeholder: "password", onKeyDown: (e) => {
				password = e.target.value
			}}),
			e("div", {},
				e("button", {onClick: async () => {
					if (!username || username.length == 0 || !password) {
						return
					}
					const response = await fetch(`/register?name=${username}&password=${password}`)
					if (response.status == 201) {
						updateUser()
					} else if (response.status == 409) {
						setState("unavailable-username")
					}
				}}, "Register"),
				e("button", {onClick: async () => {
					if (!username || username.length == 0 || !password) {
						return
					}
					const response = await fetch(`/login?name=${username}&password=${password}`)
					if (response.status == 202) {
						updateUser()
					} else if (response.status == 404) {
						setState("invalid-username")
					} else if (response.status == 403) {
						setState("invalid-password")
					}
				}}, "Login"),
			),
		)),
	)
}

const regionNames = new Intl.DisplayNames(undefined, {type: 'region'})
const MainPanel = ({channel, setChannel}) => {
	return e("div", {className: "main-panel"},
		e("div", {id: "map", className: "map-frame"}),
		e(StationPicker, {setChannel}),
		e("div", {className: "current-channel-label"},
			e("div", {className: "current-channel-label-inner"}, channel ? `${regionNames.of(channel.countrycode)}: ${channel.name}` : "[nothing playing]"),
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
