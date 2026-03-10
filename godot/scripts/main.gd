extends Node3D

const WORLD_SIZE := 1800.0
const BLOCK_SIZE := 360.0
const ROAD_WIDTH := 96.0
const SIDEWALK_WIDTH := 24.0
const LANE_OFFSET := 18.0
const STREET_EDGE := WORLD_SIZE / 2.0 - 70.0

const PLAYER_RADIUS := 0.75
const VEHICLE_RADIUS := 2.6
const PICKUP_RADIUS := 1.2

const PEDESTRIAN_COUNT := 26
const TRAFFIC_COUNT := 14
const PARKED_COUNT := 8
const PICKUP_COUNT := 12
const MAX_POLICE := 4

const VEHICLE_COLORS := [
	Color.from_string("#ff7b54", Color.WHITE),
	Color.from_string("#e8b949", Color.WHITE),
	Color.from_string("#4db6ac", Color.WHITE),
	Color.from_string("#5874dc", Color.WHITE),
	Color.from_string("#ef5350", Color.WHITE),
	Color.from_string("#8e7dff", Color.WHITE),
]

const OBJECTIVE_TEXT := {
	"intro": "Ukradnij auto i utrzymaj przewage, zanim dopadna cie radiowozy.",
	"on_foot_hint": "Na piechote jestes zwrotniejszy, ale trudniej zgubisz poscig.",
	"vehicle_hint": "Masz fure. Zbieraj gotowke i uwazaj na policje.",
	"pickup": "Masz lup. Jeszcze kilka paczek albo szybka ucieczka.",
	"ped_hit": "Masz krew na zderzaku. Policja natychmiast ruszyla.",
	"vehicle_reset": "Auto wrocilo na trase. Ruszaj dalej.",
	"player_reset": "Wrociles na start dzielnicy.",
	"on_foot_wanted": "Jestes sledzony. Schowaj sie albo dorwij auto.",
	"recovery": "Silnik znowu ciagnie. Wcisnij gaz i wyjedz z klinczu.",
	"game_over": "Koniec gry. Wcisnij R, aby zresetowac pozycje i zycie.",
}

var rng := RandomNumberGenerator.new()

var road_centers: Array = []
var sidewalk_guides: Array = []

var player: Dictionary = {}
var vehicles: Array = []
var pedestrians: Array = []
var pickups: Array = []
var next_id := 2

var running := true
var game_over := false
var objective := OBJECTIVE_TEXT["intro"]
var game_time := 0.0

var camera_yaw := -0.75
var camera_pitch := 0.56
var camera_distance := 13.0
var camera_dragging := false

var world_root: Node3D
var dynamic_root: Node3D
var player_node: Node3D
var hud_label: Label
var camera: Camera3D


func _ready() -> void:
	rng.randomize()
	camera = $Camera3D
	ensure_input_actions()
	create_world_geometry()
	initialize_state()
	create_hud()
	sync_visuals()
	update_camera(0.0)
	update_hud()


func _process(delta: float) -> void:
	if not running:
		return

	var dt := min(delta, 0.033)
	game_time += dt

	if Input.is_action_just_pressed("reset_active"):
		reset_active_entity()
		if game_over:
			game_over = false
			player["health"] = 100.0
			objective = OBJECTIVE_TEXT["player_reset"]

	if Input.is_action_just_pressed("enter_exit") and not game_over:
		try_toggle_vehicle()

	if not game_over:
		update_gameplay(dt)

	sync_visuals()
	update_camera(dt)
	update_hud()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			camera_dragging = event.pressed
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			camera_distance = clampf(camera_distance - 1.1, 6.5, 24.0)
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			camera_distance = clampf(camera_distance + 1.1, 6.5, 24.0)

	if event is InputEventMouseMotion and camera_dragging:
		camera_yaw -= event.relative.x * 0.0035
		camera_pitch = clampf(camera_pitch - event.relative.y * 0.0025, 0.18, 1.22)


func ensure_input_actions() -> void:
	add_key_action("move_left", KEY_A)
	add_key_action("move_left", KEY_LEFT)
	add_key_action("move_right", KEY_D)
	add_key_action("move_right", KEY_RIGHT)
	add_key_action("move_forward", KEY_W)
	add_key_action("move_forward", KEY_UP)
	add_key_action("move_backward", KEY_S)
	add_key_action("move_backward", KEY_DOWN)
	add_key_action("sprint", KEY_SHIFT)
	add_key_action("enter_exit", KEY_E)
	add_key_action("handbrake", KEY_SPACE)
	add_key_action("reset_active", KEY_R)


func add_key_action(action_name: String, keycode: Key) -> void:
	if not InputMap.has_action(action_name):
		InputMap.add_action(action_name)
	for existing in InputMap.action_get_events(action_name):
		if existing is InputEventKey and existing.physical_keycode == keycode:
			return
	var key_event := InputEventKey.new()
	key_event.physical_keycode = keycode
	InputMap.action_add_event(action_name, key_event)


func create_world_geometry() -> void:
	world_root = Node3D.new()
	world_root.name = "WorldRoot"
	add_child(world_root)

	dynamic_root = Node3D.new()
	dynamic_root.name = "DynamicRoot"
	add_child(dynamic_root)

	add_box(world_root, Vector3(WORLD_SIZE * 1.12, 0.25, WORLD_SIZE * 1.12), Vector3(0, -0.125, 0), Color.from_string("#6fa46f", Color.WHITE))

	road_centers = create_road_centers()
	sidewalk_guides = create_sidewalk_guides(road_centers)

	for center in road_centers:
		add_box(world_root, Vector3(WORLD_SIZE * 1.05, 0.02, ROAD_WIDTH), Vector3(0, 0.01, center), Color.from_string("#323538", Color.WHITE))
		add_box(world_root, Vector3(ROAD_WIDTH, 0.02, WORLD_SIZE * 1.05), Vector3(center, 0.01, 0), Color.from_string("#323538", Color.WHITE))

		var sidewalk_offset := ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH * 0.5
		add_box(world_root, Vector3(WORLD_SIZE, 0.05, SIDEWALK_WIDTH), Vector3(0, 0.03, center + sidewalk_offset), Color.from_string("#8b8f94", Color.GRAY))
		add_box(world_root, Vector3(WORLD_SIZE, 0.05, SIDEWALK_WIDTH), Vector3(0, 0.03, center - sidewalk_offset), Color.from_string("#8b8f94", Color.GRAY))
		add_box(world_root, Vector3(SIDEWALK_WIDTH, 0.05, WORLD_SIZE), Vector3(center + sidewalk_offset, 0.03, 0), Color.from_string("#8b8f94", Color.GRAY))
		add_box(world_root, Vector3(SIDEWALK_WIDTH, 0.05, WORLD_SIZE), Vector3(center - sidewalk_offset, 0.03, 0), Color.from_string("#8b8f94", Color.GRAY))

	# Niskie bryly budynkow dla orientacji przestrzennej.
	for index in range(56):
		var x := rng.randf_range(-STREET_EDGE + 40.0, STREET_EDGE - 40.0)
		var z := rng.randf_range(-STREET_EDGE + 40.0, STREET_EDGE - 40.0)
		var near_road := absf(x - nearest_value(road_centers, x)) < (ROAD_WIDTH * 0.8) or absf(z - nearest_value(road_centers, z)) < (ROAD_WIDTH * 0.8)
		if near_road:
			continue
		var w := rng.randf_range(32.0, 80.0)
		var h := rng.randf_range(18.0, 78.0)
		var d := rng.randf_range(32.0, 80.0)
		var tone := Color.from_hsv(rng.randf_range(0.03, 0.16), 0.2, rng.randf_range(0.52, 0.78))
		add_box(world_root, Vector3(w, h, d), Vector3(x, h * 0.5, z), tone)


func initialize_state() -> void:
	player = create_player()
	player_node = create_player_node()
	dynamic_root.add_child(player_node)

	vehicles.clear()
	pedestrians.clear()
	pickups.clear()
	next_id = 2
	game_over = false
	objective = OBJECTIVE_TEXT["intro"]

	for _i in range(TRAFFIC_COUNT):
		vehicles.append(create_traffic_vehicle(next_id))
		next_id += 1

	for _i in range(PARKED_COUNT):
		vehicles.append(create_parked_vehicle(next_id))
		next_id += 1

	for _i in range(PEDESTRIAN_COUNT):
		pedestrians.append(create_pedestrian(next_id))
		next_id += 1

	for _i in range(PICKUP_COUNT):
		pickups.append(create_pickup(next_id))
		next_id += 1


func create_player() -> Dictionary:
	var spawn_x := 0.0
	var spawn_z := 0.0
	if sidewalk_guides.size() > 3:
		spawn_x = float(sidewalk_guides[3])
	if sidewalk_guides.size() > 2:
		spawn_z = float(sidewalk_guides[2])

	return {
		"id": 1,
		"x": spawn_x,
		"y": 0.0,
		"z": spawn_z,
		"vx": 0.0,
		"vz": 0.0,
		"heading": 0.0,
		"move_heading": 0.0,
		"speed": 0.0,
		"health": 100.0,
		"cash": 0,
		"wanted": 0,
		"wanted_timer": 0.0,
		"invuln": 0.0,
		"mode": "onfoot",
		"vehicle_id": -1,
	}


func create_player_node() -> Node3D:
	var root := Node3D.new()
	root.name = "PlayerVisual"

	var body := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.55
	capsule.height = 1.2
	body.mesh = capsule

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color.from_string("#f2c09a", Color.WHITE)
	mat.roughness = 0.95
	body.material_override = mat
	body.position.y = 1.1
	root.add_child(body)

	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.33
	head.mesh = sphere
	var head_mat := StandardMaterial3D.new()
	head_mat.albedo_color = Color.from_string("#db9f78", Color.WHITE)
	head.material_override = head_mat
	head.position.y = 2.2
	root.add_child(head)

	return root


func create_vehicle_node(color: Color, police: bool) -> Node3D:
	var root := Node3D.new()

	var chassis := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(4.2, 1.5, 2.2)
	chassis.mesh = box
	chassis.position.y = 0.9

	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.72
	chassis.material_override = mat
	root.add_child(chassis)

	var roof := MeshInstance3D.new()
	var roof_box := BoxMesh.new()
	roof_box.size = Vector3(2.2, 0.8, 1.8)
	roof.mesh = roof_box
	roof.position = Vector3(-0.3, 1.7, 0.0)
	var roof_mat := StandardMaterial3D.new()
	roof_mat.albedo_color = color.darkened(0.2)
	roof.material_override = roof_mat
	root.add_child(roof)

	if police:
		var bar := MeshInstance3D.new()
		var bar_mesh := BoxMesh.new()
		bar_mesh.size = Vector3(1.1, 0.26, 0.46)
		bar.mesh = bar_mesh
		bar.position = Vector3(-0.2, 2.2, 0)
		var bar_mat := StandardMaterial3D.new()
		bar_mat.albedo_color = Color.from_string("#d9ecff", Color.WHITE)
		bar.material_override = bar_mat
		root.add_child(bar)

	return root


func create_pedestrian_node(shirt: Color, skin: Color) -> Node3D:
	var root := Node3D.new()
	var body := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 0.38
	cap.height = 1.0
	body.mesh = cap
	var shirt_mat := StandardMaterial3D.new()
	shirt_mat.albedo_color = shirt
	shirt_mat.roughness = 0.9
	body.material_override = shirt_mat
	body.position.y = 0.95
	root.add_child(body)

	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.24
	head.mesh = sphere
	var skin_mat := StandardMaterial3D.new()
	skin_mat.albedo_color = skin
	head.material_override = skin_mat
	head.position.y = 1.86
	root.add_child(head)
	return root


func create_pickup_node() -> Node3D:
	var root := Node3D.new()
	var mesh := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.45
	cyl.bottom_radius = 0.45
	cyl.height = 0.24
	mesh.mesh = cyl
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color.from_string("#7fffa3", Color.WHITE)
	mat.emission_enabled = true
	mat.emission = Color.from_string("#4cff98", Color.WHITE)
	mat.emission_energy_multiplier = 0.9
	mesh.material_override = mat
	root.add_child(mesh)
	return root


func create_traffic_vehicle(id: int) -> Dictionary:
	var axis := "x" if rng.randf() > 0.5 else "z"
	var dir := 1 if rng.randf() > 0.5 else -1
	var road_center := float(road_centers[rng.randi_range(0, road_centers.size() - 1)])
	var line_coord := get_lane_coord(axis, road_center, dir)
	var start_coord := rng.randf_range(-STREET_EDGE, STREET_EDGE)
	var target_coord := next_node(road_centers, start_coord, dir, STREET_EDGE)
	var color := VEHICLE_COLORS[rng.randi_range(0, VEHICLE_COLORS.size() - 1)]
	var node := create_vehicle_node(color, false)
	dynamic_root.add_child(node)

	return {
		"id": id,
		"kind": "civilian",
		"ai": "traffic",
		"x": start_coord if axis == "x" else line_coord,
		"y": 0.0,
		"z": start_coord if axis == "z" else line_coord,
		"vx": 0.0,
		"vz": 0.0,
		"speed": 0.0,
		"heading": heading_from_axis(axis, dir),
		"axis": axis,
		"dir": dir,
		"line_coord": line_coord,
		"road_center": road_center,
		"target_coord": target_coord,
		"cruise_speed": rng.randf_range(11.5, 15.0),
		"disabled": false,
		"siren_phase": 0.0,
		"throttle_input": 0.0,
		"steer_input": 0.0,
		"stuck_timer": 0.0,
		"recovery_cooldown": 0.0,
		"node": node,
	}


func create_parked_vehicle(id: int) -> Dictionary:
	var axis := "x" if rng.randf() > 0.5 else "z"
	var dir := 1 if rng.randf() > 0.5 else -1
	var road_center := float(road_centers[rng.randi_range(0, road_centers.size() - 1)])
	var curb_offset := ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH + 6.0
	var line_coord := road_center
	if axis == "x":
		line_coord += -curb_offset if dir > 0 else curb_offset
	else:
		line_coord += curb_offset if dir > 0 else -curb_offset
	var pos := rng.randf_range(-STREET_EDGE * 0.65, STREET_EDGE * 0.65)
	var color := VEHICLE_COLORS[rng.randi_range(0, VEHICLE_COLORS.size() - 1)]
	var node := create_vehicle_node(color, false)
	dynamic_root.add_child(node)

	return {
		"id": id,
		"kind": "civilian",
		"ai": "parked",
		"x": pos if axis == "x" else line_coord,
		"y": 0.0,
		"z": pos if axis == "z" else line_coord,
		"vx": 0.0,
		"vz": 0.0,
		"speed": 0.0,
		"heading": heading_from_axis(axis, dir),
		"axis": axis,
		"dir": dir,
		"line_coord": line_coord,
		"road_center": road_center,
		"target_coord": pos,
		"cruise_speed": 0.0,
		"disabled": false,
		"siren_phase": 0.0,
		"throttle_input": 0.0,
		"steer_input": 0.0,
		"stuck_timer": 0.0,
		"recovery_cooldown": 0.0,
		"node": node,
	}


func create_police_vehicle(id: int, spawn: Dictionary) -> Dictionary:
	var node := create_vehicle_node(Color.from_string("#f5f7fb", Color.WHITE), true)
	dynamic_root.add_child(node)
	return {
		"id": id,
		"kind": "police",
		"ai": "police",
		"x": spawn["x"],
		"y": 0.0,
		"z": spawn["z"],
		"vx": 0.0,
		"vz": 0.0,
		"speed": 0.0,
		"heading": spawn["heading"],
		"axis": spawn["axis"],
		"dir": spawn["dir"],
		"line_coord": spawn["line_coord"],
		"road_center": spawn["road_center"],
		"target_coord": spawn["target_coord"],
		"cruise_speed": 19.5,
		"disabled": false,
		"siren_phase": 0.0,
		"throttle_input": 0.0,
		"steer_input": 0.0,
		"stuck_timer": 0.0,
		"recovery_cooldown": 0.0,
		"node": node,
	}


func create_pedestrian(id: int) -> Dictionary:
	var spot := random_sidewalk_spot()
	var route := create_ped_route(spot["x"], spot["z"], spot["axis"])
	var skin := Color.from_hsv(rng.randf_range(0.07, 0.14), 0.35, rng.randf_range(0.72, 0.84))
	var shirt := Color.from_hsv(rng.randf(), 0.62, 0.84)
	var node := create_pedestrian_node(shirt, skin)
	dynamic_root.add_child(node)
	return {
		"id": id,
		"x": route["x"],
		"y": 0.0,
		"z": route["z"],
		"vx": 0.0,
		"vz": 0.0,
		"heading": route["heading"],
		"axis": route["axis"],
		"line": route["line"],
		"dir": route["dir"],
		"target_x": route["target_x"],
		"target_z": route["target_z"],
		"base_speed": rng.randf_range(3.2, 5.2),
		"panic": 0.0,
		"panic_heading": route["heading"],
		"alive": true,
		"node": node,
	}


func create_pickup(id: int) -> Dictionary:
	var spot := random_sidewalk_spot()
	var node := create_pickup_node()
	dynamic_root.add_child(node)
	return {
		"id": id,
		"x": spot["x"],
		"y": 0.8,
		"z": spot["z"],
		"value": rng.randi_range(60, 280),
		"bob": rng.randf() * TAU,
		"node": node,
	}


func update_gameplay(dt: float) -> void:
	if player["mode"] == "vehicle" and player["vehicle_id"] != -1:
		update_vehicles(dt)
		update_player_from_vehicle()
	else:
		update_on_foot(dt)
		update_vehicles(dt)

	update_pedestrians(dt)
	update_pickups(dt)
	handle_collisions(dt)
	recover_player_vehicle_if_stuck(dt)
	refresh_dead_pedestrians()
	update_police_presence(dt)

	if int(player["wanted"]) > 0 and player["mode"] == "onfoot":
		objective = OBJECTIVE_TEXT["on_foot_wanted"]


func update_on_foot(dt: float) -> void:
	var move_x := get_axis("move_left", "move_right")
	var move_forward := get_axis("move_backward", "move_forward")
	var sprint := Input.is_action_pressed("sprint")

	if is_zero_approx(move_x) and is_zero_approx(move_forward):
		player["vx"] = lerpf(player["vx"], 0.0, dt * 8.0)
		player["vz"] = lerpf(player["vz"], 0.0, dt * 8.0)
		player["speed"] = sqrt(player["vx"] * player["vx"] + player["vz"] * player["vz"])
		if player["speed"] > 0.08:
			player["heading"] = lerp_angle(player["heading"], player["move_heading"], dt * 8.0)
		return

	var length := sqrt(move_x * move_x + move_forward * move_forward)
	if length < 0.001:
		return
	var local_x := move_x / length
	var local_forward := move_forward / length
	var move := camera_relative_vector(local_x, local_forward)
	var speed := 12.0 if sprint else 7.0
	var desired_heading := atan2(move.y, move.x)

	player["vx"] = lerpf(player["vx"], move.x * speed, dt * 10.0)
	player["vz"] = lerpf(player["vz"], move.y * speed, dt * 10.0)
	player["x"] += player["vx"] * dt
	player["z"] += player["vz"] * dt
	player["move_heading"] = lerp_angle(player["move_heading"], desired_heading, dt * 12.0)
	player["heading"] = lerp_angle(player["heading"], player["move_heading"], dt * 14.0)
	player["speed"] = sqrt(player["vx"] * player["vx"] + player["vz"] * player["vz"])
	player["x"] = clampf(player["x"], -STREET_EDGE, STREET_EDGE)
	player["z"] = clampf(player["z"], -STREET_EDGE, STREET_EDGE)


func try_toggle_vehicle() -> void:
	if player["mode"] == "vehicle" and player["vehicle_id"] != -1:
		var vehicle := get_vehicle_by_id(player["vehicle_id"])
		if vehicle.is_empty():
			return
		player["mode"] = "onfoot"
		player["vehicle_id"] = -1
		player["x"] = clampf(vehicle["x"] + cos(vehicle["heading"] + PI * 0.5) * 3.4, -STREET_EDGE, STREET_EDGE)
		player["z"] = clampf(vehicle["z"] + sin(vehicle["heading"] + PI * 0.5) * 3.4, -STREET_EDGE, STREET_EDGE)
		player["heading"] = vehicle["heading"]
		player["move_heading"] = vehicle["heading"]
		vehicle["ai"] = "parked"
		vehicle["speed"] = 0.0
		vehicle["vx"] = 0.0
		vehicle["vz"] = 0.0
		objective = OBJECTIVE_TEXT["on_foot_hint"]
		return

	var best: Dictionary = {}
	var best_distance := INF
	for vehicle in vehicles:
		if vehicle["kind"] == "police" or vehicle["disabled"]:
			continue
		var gap := distance_2d(player["x"], player["z"], vehicle["x"], vehicle["z"])
		if gap < 4.6 and absf(vehicle["speed"]) < 6.0 and gap < best_distance:
			best = vehicle
			best_distance = gap

	if not best.is_empty():
		player["mode"] = "vehicle"
		player["vehicle_id"] = best["id"]
		best["ai"] = "player"
		best["speed"] = maxf(best["speed"], 0.0)
		objective = OBJECTIVE_TEXT["vehicle_hint"]


func update_player_from_vehicle() -> void:
	var vehicle := get_vehicle_by_id(player["vehicle_id"])
	if vehicle.is_empty():
		player["mode"] = "onfoot"
		player["vehicle_id"] = -1
		return
	player["x"] = vehicle["x"]
	player["z"] = vehicle["z"]
	player["heading"] = vehicle["heading"]
	player["move_heading"] = vehicle["heading"]
	player["speed"] = absf(vehicle["speed"])


func reset_active_entity() -> void:
	if player["mode"] == "vehicle" and player["vehicle_id"] != -1:
		var vehicle := get_vehicle_by_id(player["vehicle_id"])
		if vehicle.is_empty():
			return
		var spawn := {
			"axis": "x",
			"dir": 1,
			"line_coord": get_lane_coord("x", 0.0, 1),
			"road_center": 0.0,
			"target_coord": next_node(road_centers, 0.0, 1, STREET_EDGE),
			"heading": 0.0,
			"x": 0.0,
			"z": get_lane_coord("x", 0.0, 1),
		}
		set_vehicle_route(vehicle, spawn)
		vehicle["x"] = spawn["x"]
		vehicle["z"] = spawn["z"]
		vehicle["vx"] = 0.0
		vehicle["vz"] = 0.0
		vehicle["speed"] = 0.0
		vehicle["disabled"] = false
		player["invuln"] = maxf(player["invuln"], 0.6)
		update_player_from_vehicle()
		objective = OBJECTIVE_TEXT["vehicle_reset"]
		return

	player["x"] = 0.0 if sidewalk_guides.size() <= 3 else sidewalk_guides[3]
	player["z"] = 0.0 if sidewalk_guides.size() <= 2 else sidewalk_guides[2]
	player["vx"] = 0.0
	player["vz"] = 0.0
	player["heading"] = 0.0
	player["move_heading"] = 0.0
	player["speed"] = 0.0
	player["invuln"] = maxf(player["invuln"], 0.45)
	objective = OBJECTIVE_TEXT["player_reset"]


func update_vehicles(dt: float) -> void:
	var anchor := get_player_anchor()
	for vehicle in vehicles:
		if vehicle["ai"] == "player":
			update_player_vehicle(vehicle, dt)
		elif vehicle["ai"] == "traffic":
			update_traffic_vehicle(vehicle, dt)
		elif vehicle["ai"] == "police":
			update_police_vehicle(vehicle, anchor, dt)


func update_traffic_vehicle(vehicle: Dictionary, dt: float) -> void:
	if vehicle["disabled"]:
		vehicle["speed"] = lerpf(vehicle["speed"], 0.0, dt * 4.0)
		return

	var factor := compute_traffic_factor(vehicle)
	var target_speed := vehicle["cruise_speed"] * factor
	vehicle["speed"] = lerpf(vehicle["speed"], target_speed, dt * (3.1 if factor < 0.98 else 1.2))
	vehicle["heading"] = heading_from_axis(vehicle["axis"], vehicle["dir"])
	var velocity := compose_velocity(vehicle["heading"], vehicle["speed"], 0.0)
	vehicle["vx"] = velocity.x
	vehicle["vz"] = velocity.y

	if vehicle["axis"] == "x":
		vehicle["z"] = lerpf(vehicle["z"], vehicle["line_coord"], dt * 7.0)
		vehicle["x"] += vehicle["dir"] * vehicle["speed"] * dt
		var remaining_x := (vehicle["target_coord"] - vehicle["x"]) * vehicle["dir"]
		if remaining_x <= 0.0:
			vehicle["x"] = vehicle["target_coord"]
			set_vehicle_route(vehicle, choose_traffic_turn(vehicle, {}))
	else:
		vehicle["x"] = lerpf(vehicle["x"], vehicle["line_coord"], dt * 7.0)
		vehicle["z"] += vehicle["dir"] * vehicle["speed"] * dt
		var remaining_z := (vehicle["target_coord"] - vehicle["z"]) * vehicle["dir"]
		if remaining_z <= 0.0:
			vehicle["z"] = vehicle["target_coord"]
			set_vehicle_route(vehicle, choose_traffic_turn(vehicle, {}))


func update_police_vehicle(vehicle: Dictionary, anchor: Dictionary, dt: float) -> void:
	if vehicle["disabled"]:
		return

	vehicle["siren_phase"] += dt * 12.0
	vehicle["speed"] = lerpf(vehicle["speed"], vehicle["cruise_speed"], dt * 2.2)
	vehicle["heading"] = heading_from_axis(vehicle["axis"], vehicle["dir"])

	if vehicle["axis"] == "x":
		vehicle["z"] = lerpf(vehicle["z"], vehicle["line_coord"], dt * 9.0)
		vehicle["x"] += vehicle["dir"] * vehicle["speed"] * dt
		var remaining_x := (vehicle["target_coord"] - vehicle["x"]) * vehicle["dir"]
		if remaining_x <= 0.0:
			vehicle["x"] = vehicle["target_coord"]
			set_vehicle_route(vehicle, choose_traffic_turn(vehicle, anchor))
	else:
		vehicle["x"] = lerpf(vehicle["x"], vehicle["line_coord"], dt * 9.0)
		vehicle["z"] += vehicle["dir"] * vehicle["speed"] * dt
		var remaining_z := (vehicle["target_coord"] - vehicle["z"]) * vehicle["dir"]
		if remaining_z <= 0.0:
			vehicle["z"] = vehicle["target_coord"]
			set_vehicle_route(vehicle, choose_traffic_turn(vehicle, anchor))


func update_player_vehicle(vehicle: Dictionary, dt: float) -> void:
	var throttle := get_axis("move_backward", "move_forward")
	var steer := get_axis("move_left", "move_right")
	var braking := Input.is_action_pressed("handbrake")

	var local := project_local_velocity(vehicle["heading"], vehicle["vx"], vehicle["vz"])
	var forward_speed := local.x
	var lateral_speed := local.y
	var on_road := absf(vehicle["z"] - nearest_value(road_centers, vehicle["z"])) < ROAD_WIDTH * 0.6 or absf(vehicle["x"] - nearest_value(road_centers, vehicle["x"])) < ROAD_WIDTH * 0.6
	var max_forward := 28.0 if on_road else 20.0
	var speed_ratio := clampf(absf(forward_speed) / max_forward, 0.0, 1.0)
	var drive_force := 34.0 if throttle >= 0.0 else 24.0
	var drag := 7.2 if braking else 2.1 if on_road else 3.8
	var low_speed_boost := (1.0 - speed_ratio * 0.55) if not is_zero_approx(throttle) else 0.42

	forward_speed += throttle * drive_force * dt * low_speed_boost
	forward_speed = clampf(forward_speed, -11.0, max_forward)
	forward_speed = lerpf(forward_speed, 0.0, dt * drag)
	lateral_speed = lerpf(lateral_speed, 0.0, dt * (15.0 if on_road else 5.5))

	var steering_grip := 3.25 if braking else lerpf(3.4, 1.15, speed_ratio)
	var steering_authority := maxf(0.42, 1.0 - speed_ratio * 0.48)
	var steering_scale := maxf(0.3, absf(forward_speed) / 5.0)
	var direction_sign := 1.0 if forward_speed >= 0.0 else -0.52
	vehicle["heading"] += steer * steering_grip * steering_authority * steering_scale * dt * direction_sign

	var side_slip := 0.34
	if braking:
		side_slip = 0.22
	elif on_road:
		side_slip = lerpf(0.08, 0.16, speed_ratio)
	var velocity := compose_velocity(vehicle["heading"], forward_speed, lateral_speed * side_slip)
	vehicle["vx"] = velocity.x
	vehicle["vz"] = velocity.y
	vehicle["speed"] = forward_speed
	vehicle["throttle_input"] = throttle
	vehicle["steer_input"] = steer
	vehicle["x"] = clampf(vehicle["x"] + vehicle["vx"] * dt, -STREET_EDGE, STREET_EDGE)
	vehicle["z"] = clampf(vehicle["z"] + vehicle["vz"] * dt, -STREET_EDGE, STREET_EDGE)


func update_pedestrians(dt: float) -> void:
	for ped in pedestrians:
		if not ped["alive"]:
			continue
		var was_panicking := ped["panic"] > 0.0

		var close_threat := find_close_threat(ped)
		if not close_threat.is_empty():
			ped["panic"] = 1.2
			ped["panic_heading"] = atan2(ped["z"] - close_threat["z"], ped["x"] - close_threat["x"])

		ped["panic"] = maxf(0.0, ped["panic"] - dt)

		if ped["panic"] > 0.0:
			var jitter := sin((ped["x"] + ped["z"]) * 0.03 + ped["panic"] * 7.0) * 0.25
			ped["heading"] = ped["panic_heading"] + jitter
			ped["vx"] = cos(ped["heading"]) * 6.5
			ped["vz"] = sin(ped["heading"]) * 6.5
			ped["x"] += ped["vx"] * dt
			ped["z"] += ped["vz"] * dt
		else:
			if ped["axis"] == "x":
				ped["z"] = lerpf(ped["z"], ped["line"], dt * 9.0)
			else:
				ped["x"] = lerpf(ped["x"], ped["line"], dt * 9.0)

			if distance_2d(ped["x"], ped["z"], ped["target_x"], ped["target_z"]) < 1.4:
				ped["x"] = ped["target_x"]
				ped["z"] = ped["target_z"]
				var next_route := choose_next_ped_target(ped, true)
				ped["axis"] = next_route["axis"]
				ped["line"] = next_route["line"]
				ped["dir"] = next_route["dir"]
				ped["target_x"] = next_route["target_x"]
				ped["target_z"] = next_route["target_z"]
				ped["heading"] = next_route["heading"]

			var desired_x := ped["target_x"] - ped["x"]
			var desired_z := ped["target_z"] - ped["z"]
			if absf(desired_x) > 0.01 or absf(desired_z) > 0.01:
				ped["heading"] = atan2(desired_z, desired_x)

			var avoid_x := 0.0
			var avoid_z := 0.0
			for other in pedestrians:
				if other == ped or not other["alive"]:
					continue
				var gap := distance_2d(ped["x"], ped["z"], other["x"], other["z"])
				if gap > 0.0 and gap < 2.2:
					avoid_x += (ped["x"] - other["x"]) / gap
					avoid_z += (ped["z"] - other["z"]) / gap

			var blend_x := desired_x + avoid_x * 2.0
			var blend_z := desired_z + avoid_z * 2.0
			if absf(blend_x) > 0.01 or absf(blend_z) > 0.01:
				ped["heading"] = atan2(blend_z, blend_x)

			ped["vx"] = lerpf(ped["vx"], cos(ped["heading"]) * ped["base_speed"], dt * 6.0)
			ped["vz"] = lerpf(ped["vz"], sin(ped["heading"]) * ped["base_speed"], dt * 6.0)
			ped["x"] += ped["vx"] * dt
			ped["z"] += ped["vz"] * dt

		ped["x"] = clampf(ped["x"], -STREET_EDGE, STREET_EDGE)
		ped["z"] = clampf(ped["z"], -STREET_EDGE, STREET_EDGE)

		if was_panicking and is_zero_approx(ped["panic"]):
			reset_pedestrian_route(ped, ped["axis"])


func update_pickups(dt: float) -> void:
	var anchor := get_player_anchor()
	for index in range(pickups.size() - 1, -1, -1):
		var pickup: Dictionary = pickups[index]
		pickup["bob"] += dt * 2.2
		if distance_2d(anchor["x"], anchor["z"], pickup["x"], pickup["z"]) < PICKUP_RADIUS + 1.4:
			player["cash"] += int(pickup["value"])
			objective = OBJECTIVE_TEXT["pickup"]
			pickup["node"].queue_free()
			pickups.remove_at(index)

	while pickups.size() < PICKUP_COUNT:
		pickups.append(create_pickup(next_id))
		next_id += 1


func handle_collisions(dt: float) -> void:
	var player_vehicle := get_vehicle_by_id(player["vehicle_id"]) if player["vehicle_id"] != -1 else {}

	if player_vehicle.is_empty():
		for vehicle in vehicles:
			if vehicle["ai"] == "parked":
				continue
			if distance_2d(player["x"], player["z"], vehicle["x"], vehicle["z"]) < PLAYER_RADIUS + VEHICLE_RADIUS and absf(vehicle["speed"]) > 8.0:
				register_player_damage(18.0, 1.0, "traffic")

	if not player_vehicle.is_empty():
		for ped in pedestrians:
			if not ped["alive"]:
				continue
			if distance_2d(player_vehicle["x"], player_vehicle["z"], ped["x"], ped["z"]) < 2.4 and absf(player_vehicle["speed"]) > 7.0:
				ped["alive"] = false
				player["cash"] += 40
				add_wanted(1, 18.0)
				objective = OBJECTIVE_TEXT["ped_hit"]

	for i in range(vehicles.size()):
		for j in range(i + 1, vehicles.size()):
			var a: Dictionary = vehicles[i]
			var b: Dictionary = vehicles[j]
			if a["ai"] == "parked" and b["ai"] == "parked":
				continue
			if collide_vehicles(a, b):
				if not player_vehicle.is_empty() and (a["id"] == player_vehicle["id"] or b["id"] == player_vehicle["id"]):
					register_player_damage(8.0, 0.35, "collision")

	for police in vehicles:
		if police["ai"] != "police":
			continue
		if distance_2d(police["x"], police["z"], player["x"], player["z"]) < 5.5:
			if register_player_damage(9.0 if not player_vehicle.is_empty() else 14.0, 0.35, "police"):
				player["wanted_timer"] = maxf(player["wanted_timer"], 12.0)

	player["invuln"] = maxf(0.0, player["invuln"] - dt)
	player["health"] = clampf(player["health"], 0.0, 100.0)
	if player["health"] <= 0.0:
		game_over = true
		objective = OBJECTIVE_TEXT["game_over"]


func recover_player_vehicle_if_stuck(dt: float) -> void:
	if player["mode"] != "vehicle" or player["vehicle_id"] == -1:
		return
	var vehicle := get_vehicle_by_id(player["vehicle_id"])
	if vehicle.is_empty():
		return

	vehicle["recovery_cooldown"] = maxf(0.0, vehicle["recovery_cooldown"] - dt)
	var blocker := find_vehicle_blocker(vehicle)
	var driver_trying := absf(vehicle["throttle_input"]) > 0.6
	var jammed := not blocker.is_zero_approx() and driver_trying and absf(vehicle["speed"]) < 2.2
	vehicle["stuck_timer"] = vehicle["stuck_timer"] + dt if jammed else 0.0

	if vehicle["stuck_timer"] < 0.7 or vehicle["recovery_cooldown"] > 0.0:
		return

	var nudge := 3.0 + absf(vehicle["steer_input"]) * 0.9
	vehicle["x"] = clampf(vehicle["x"] + blocker.x * nudge, -STREET_EDGE, STREET_EDGE)
	vehicle["z"] = clampf(vehicle["z"] + blocker.y * nudge, -STREET_EDGE, STREET_EDGE)
	vehicle["vx"] = blocker.x * 4.5
	vehicle["vz"] = blocker.y * 4.5
	vehicle["speed"] = project_local_velocity(vehicle["heading"], vehicle["vx"], vehicle["vz"]).x
	vehicle["stuck_timer"] = 0.0
	vehicle["recovery_cooldown"] = 1.1
	player["invuln"] = maxf(player["invuln"], 0.2)
	objective = OBJECTIVE_TEXT["recovery"]


func refresh_dead_pedestrians() -> void:
	for index in range(pedestrians.size() - 1, -1, -1):
		var ped: Dictionary = pedestrians[index]
		if ped["alive"]:
			continue
		ped["node"].queue_free()
		pedestrians.remove_at(index)
		pedestrians.append(create_pedestrian(next_id))
		next_id += 1


func update_police_presence(dt: float) -> void:
	advance_wanted(dt)
	var desired := desired_police_count(player["wanted"])
	var police: Array = []
	for vehicle in vehicles:
		if vehicle["ai"] == "police":
			police.append(vehicle)

	while police.size() < desired:
		var spawn := find_police_spawn(get_player_anchor())
		var cop := create_police_vehicle(next_id, spawn)
		next_id += 1
		vehicles.append(cop)
		police.append(cop)

	while police.size() > desired:
		var remove_vehicle: Dictionary = police.pop_back()
		remove_vehicle["node"].queue_free()
		vehicles.erase(remove_vehicle)


func register_player_damage(amount: float, invuln: float, _source: String) -> bool:
	if player["invuln"] > 0.0:
		return false
	player["health"] -= amount
	player["invuln"] = invuln
	return true


func advance_wanted(dt: float) -> void:
	if player["wanted"] <= 0:
		player["wanted_timer"] = 0.0
		return
	player["wanted_timer"] = maxf(0.0, player["wanted_timer"] - dt)
	if is_zero_approx(player["wanted_timer"]):
		player["wanted"] = int(clampi(player["wanted"] - 1, 0, 5))
		player["wanted_timer"] = 10.0 if player["wanted"] > 0 else 0.0


func add_wanted(amount: int, cooldown: float) -> void:
	player["wanted"] = int(clampi(player["wanted"] + amount, 0, 5))
	player["wanted_timer"] = maxf(player["wanted_timer"], cooldown)


func desired_police_count(wanted_level: int) -> int:
	if wanted_level <= 0:
		return 0
	return min(1 + wanted_level, MAX_POLICE)


func find_close_threat(ped: Dictionary) -> Dictionary:
	for vehicle in vehicles:
		if vehicle["ai"] == "parked":
			continue
		if distance_2d(ped["x"], ped["z"], vehicle["x"], vehicle["z"]) < 10.0 and absf(vehicle["speed"]) > 8.0:
			return vehicle

	if distance_2d(ped["x"], ped["z"], player["x"], player["z"]) < 10.0 and absf(player["speed"]) > 8.0:
		return player

	return {}


func get_player_anchor() -> Dictionary:
	if player["mode"] == "vehicle" and player["vehicle_id"] != -1:
		var vehicle := get_vehicle_by_id(player["vehicle_id"])
		if not vehicle.is_empty():
			return vehicle
	return player


func get_vehicle_by_id(id_value: int) -> Dictionary:
	for vehicle in vehicles:
		if vehicle["id"] == id_value:
			return vehicle
	return {}


func compute_traffic_factor(vehicle: Dictionary) -> float:
	var factor := 1.0
	for other in vehicles:
		if other["id"] == vehicle["id"] or other["ai"] == "parked":
			continue
		factor = minf(factor, compute_obstacle_factor(vehicle, other, 28.0, 7.0, 0.22, false))

	var anchor := get_player_anchor()
	if anchor["id"] != vehicle["id"]:
		factor = minf(factor, compute_obstacle_factor(vehicle, anchor, 24.0, 9.0, 0.12, true))
	return factor


func compute_obstacle_factor(vehicle: Dictionary, target: Dictionary, max_distance: float, lane_width: float, min_factor: float, allow_rear_buffer: bool) -> float:
	var dx := target["x"] - vehicle["x"]
	var dz := target["z"] - vehicle["z"]
	var dist := sqrt(dx * dx + dz * dz)
	if is_zero_approx(dist) or dist > max_distance:
		return 1.0

	var forward_x := cos(vehicle["heading"])
	var forward_z := sin(vehicle["heading"])
	var right_x := -forward_z
	var right_z := forward_x
	var ahead := dx * forward_x + dz * forward_z
	var lateral := absf(dx * right_x + dz * right_z)
	var min_ahead := -4.0 if allow_rear_buffer else 0.0

	if ahead <= min_ahead or lateral > lane_width:
		return 1.0

	return clampf((dist - 7.0) / max_distance, min_factor, 1.0)


func find_vehicle_blocker(vehicle: Dictionary) -> Vector2:
	if absf(vehicle["x"]) > STREET_EDGE - 1.4:
		return Vector2(-sign(vehicle["x"]), 0.0)
	if absf(vehicle["z"]) > STREET_EDGE - 1.4:
		return Vector2(0.0, -sign(vehicle["z"]))

	for other in vehicles:
		if other["id"] == vehicle["id"]:
			continue
		var contact := detect_vehicle_contact(vehicle, other)
		if contact.is_empty():
			continue
		var normal: Vector2 = contact["normal"]
		return -normal
	return Vector2.ZERO


func detect_vehicle_contact(a: Dictionary, b: Dictionary) -> Dictionary:
	var dx := b["x"] - a["x"]
	var dz := b["z"] - a["z"]
	var gap := sqrt(dx * dx + dz * dz)
	var min_gap := VEHICLE_RADIUS * 1.95
	if gap >= min_gap:
		return {}
	var normal := Vector2(1.0, 0.0)
	if gap > 0.0001:
		normal = Vector2(dx / gap, dz / gap)
	return {
		"overlap": min_gap - gap,
		"normal": normal,
	}


func collide_vehicles(a: Dictionary, b: Dictionary) -> bool:
	var contact := detect_vehicle_contact(a, b)
	if contact.is_empty():
		return false

	var mass_a := 4.0 if a["ai"] == "parked" else 1.0
	var mass_b := 4.0 if b["ai"] == "parked" else 1.0
	var push_a := mass_b / (mass_a + mass_b)
	var push_b := mass_a / (mass_a + mass_b)
	var separation := contact["overlap"] + 0.04
	var n: Vector2 = contact["normal"]

	a["x"] -= n.x * separation * push_a
	a["z"] -= n.y * separation * push_a
	b["x"] += n.x * separation * push_b
	b["z"] += n.y * separation * push_b

	var along_a := a["vx"] * n.x + a["vz"] * n.y
	var along_b := b["vx"] * n.x + b["vz"] * n.y
	var exchange := (along_a - along_b) * 0.48

	a["vx"] -= n.x * exchange * push_a
	a["vz"] -= n.y * exchange * push_a
	b["vx"] += n.x * exchange * push_b
	b["vz"] += n.y * exchange * push_b
	a["speed"] = project_local_velocity(a["heading"], a["vx"], a["vz"]).x
	b["speed"] = project_local_velocity(b["heading"], b["vx"], b["vz"]).x
	return true


func reset_pedestrian_route(ped: Dictionary, preferred_axis: String = "") -> void:
	var route := create_ped_route(ped["x"], ped["z"], preferred_axis)
	ped["x"] = route["x"]
	ped["z"] = route["z"]
	ped["axis"] = route["axis"]
	ped["line"] = route["line"]
	ped["dir"] = route["dir"]
	ped["target_x"] = route["target_x"]
	ped["target_z"] = route["target_z"]
	ped["heading"] = route["heading"]
	ped["vx"] = 0.0
	ped["vz"] = 0.0


func random_sidewalk_spot() -> Dictionary:
	var line := float(sidewalk_guides[rng.randi_range(0, sidewalk_guides.size() - 1)])
	if rng.randf() > 0.5:
		return {
			"x": line,
			"z": rng.randf_range(-STREET_EDGE, STREET_EDGE),
			"axis": "z",
		}
	return {
		"x": rng.randf_range(-STREET_EDGE, STREET_EDGE),
		"z": line,
		"axis": "x",
	}


func create_ped_route(x: float, z: float, preferred_axis: String = "") -> Dictionary:
	var nearest_vertical := nearest_value(sidewalk_guides, x)
	var nearest_horizontal := nearest_value(sidewalk_guides, z)
	var axis := preferred_axis
	if axis == "":
		axis = "z" if absf(x - nearest_vertical) < absf(z - nearest_horizontal) else "x"
	var dir := 1 if rng.randf() > 0.5 else -1

	if axis == "x":
		var line := nearest_horizontal
		var target_x := next_node(sidewalk_guides, x, dir, STREET_EDGE)
		return {
			"x": x,
			"z": line,
			"axis": axis,
			"line": line,
			"dir": 1 if target_x >= x else -1,
			"target_x": target_x,
			"target_z": line,
			"heading": 0.0 if target_x >= x else PI,
		}

	var line_v := nearest_vertical
	var target_z := next_node(sidewalk_guides, z, dir, STREET_EDGE)
	return {
		"x": line_v,
		"z": z,
		"axis": axis,
		"line": line_v,
		"dir": 1 if target_z >= z else -1,
		"target_x": line_v,
		"target_z": target_z,
		"heading": PI * 0.5 if target_z >= z else -PI * 0.5,
	}


func choose_next_ped_target(ped: Dictionary, allow_turn: bool = true) -> Dictionary:
	var should_turn := allow_turn and rng.randf() < 0.25

	if ped["axis"] == "x":
		if should_turn:
			var dir := 1 if rng.randf() > 0.5 else -1
			var line := nearest_value(sidewalk_guides, ped["x"])
			var target_z := next_node(sidewalk_guides, ped["z"], dir, STREET_EDGE)
			return {
				"axis": "z",
				"line": line,
				"dir": 1 if target_z >= ped["z"] else -1,
				"target_x": line,
				"target_z": target_z,
				"heading": PI * 0.5 if target_z >= ped["z"] else -PI * 0.5,
			}
		var target_x := next_node(sidewalk_guides, ped["x"], ped["dir"], STREET_EDGE)
		return {
			"axis": "x",
			"line": ped["line"],
			"dir": 1 if target_x >= ped["x"] else -1,
			"target_x": target_x,
			"target_z": ped["line"],
			"heading": 0.0 if target_x >= ped["x"] else PI,
		}

	if should_turn:
		var dir_turn := 1 if rng.randf() > 0.5 else -1
		var line_turn := nearest_value(sidewalk_guides, ped["z"])
		var target_x_turn := next_node(sidewalk_guides, ped["x"], dir_turn, STREET_EDGE)
		return {
			"axis": "x",
			"line": line_turn,
			"dir": 1 if target_x_turn >= ped["x"] else -1,
			"target_x": target_x_turn,
			"target_z": line_turn,
			"heading": 0.0 if target_x_turn >= ped["x"] else PI,
		}

	var target_z_straight := next_node(sidewalk_guides, ped["z"], ped["dir"], STREET_EDGE)
	return {
		"axis": "z",
		"line": ped["line"],
		"dir": 1 if target_z_straight >= ped["z"] else -1,
		"target_x": ped["line"],
		"target_z": target_z_straight,
		"heading": PI * 0.5 if target_z_straight >= ped["z"] else -PI * 0.5,
	}


func choose_traffic_turn(vehicle: Dictionary, chase_target: Dictionary) -> Dictionary:
	var intersection_x := vehicle["target_coord"] if vehicle["axis"] == "x" else nearest_value(road_centers, vehicle["line_coord"])
	var intersection_z := vehicle["target_coord"] if vehicle["axis"] == "z" else nearest_value(road_centers, vehicle["line_coord"])
	var options: Array = []

	add_traffic_option(options, intersection_x, intersection_z, vehicle["axis"], vehicle["dir"])
	if vehicle["axis"] == "x":
		add_traffic_option(options, intersection_x, intersection_z, "z", -1 if vehicle["dir"] > 0 else 1)
		add_traffic_option(options, intersection_x, intersection_z, "z", 1 if vehicle["dir"] > 0 else -1)
	else:
		add_traffic_option(options, intersection_x, intersection_z, "x", 1 if vehicle["dir"] > 0 else -1)
		add_traffic_option(options, intersection_x, intersection_z, "x", -1 if vehicle["dir"] > 0 else 1)

	if not chase_target.is_empty():
		var best := options[0]
		var best_dist := INF
		for option in options:
			var sample_x := option["target_coord"] if option["axis"] == "x" else option["line_coord"]
			var sample_z := option["target_coord"] if option["axis"] == "z" else option["line_coord"]
			var dist := distance_2d(sample_x, sample_z, chase_target["x"], chase_target["z"])
			if dist < best_dist:
				best_dist = dist
				best = option
		return best

	var roll := rng.randf()
	if roll < 0.56:
		return options[0]
	if roll < 0.78:
		return options[1]
	return options[2]


func add_traffic_option(options: Array, intersection_x: float, intersection_z: float, axis: String, dir: int) -> void:
	var road_center := intersection_z if axis == "x" else intersection_x
	var line_coord := get_lane_coord(axis, road_center, dir)
	var current_coord := intersection_x if axis == "x" else intersection_z
	var target_coord := next_node(road_centers, current_coord, dir, STREET_EDGE)
	options.append({
		"axis": axis,
		"dir": dir,
		"road_center": road_center,
		"line_coord": line_coord,
		"target_coord": target_coord,
		"heading": heading_from_axis(axis, dir),
	})


func find_police_spawn(target: Dictionary) -> Dictionary:
	var edge_offset := 260.0 + rng.randf() * 120.0
	var edge := rng.randi_range(0, 3)
	var x := float(target["x"])
	var z := float(target["z"])

	if edge == 0:
		z -= edge_offset
	elif edge == 1:
		x += edge_offset
	elif edge == 2:
		z += edge_offset
	else:
		x -= edge_offset

	x = clampf(x, -STREET_EDGE, STREET_EDGE)
	z = clampf(z, -STREET_EDGE, STREET_EDGE)

	var nearest_x := nearest_value(road_centers, x)
	var nearest_z := nearest_value(road_centers, z)
	if absf(x - nearest_x) < absf(z - nearest_z):
		var dir_z := 1 if target["z"] > z else -1
		var lane_z := get_lane_coord("z", nearest_x, dir_z)
		return {
			"axis": "z",
			"dir": dir_z,
			"road_center": nearest_x,
			"line_coord": lane_z,
			"x": lane_z,
			"z": z,
			"target_coord": next_node(road_centers, z, dir_z, STREET_EDGE),
			"heading": heading_from_axis("z", dir_z),
		}

	var dir_x := 1 if target["x"] > x else -1
	var lane_x := get_lane_coord("x", nearest_z, dir_x)
	return {
		"axis": "x",
		"dir": dir_x,
		"road_center": nearest_z,
		"line_coord": lane_x,
		"x": x,
		"z": lane_x,
		"target_coord": next_node(road_centers, x, dir_x, STREET_EDGE),
		"heading": heading_from_axis("x", dir_x),
	}


func set_vehicle_route(vehicle: Dictionary, route: Dictionary) -> void:
	vehicle["axis"] = route["axis"]
	vehicle["dir"] = route["dir"]
	vehicle["line_coord"] = route["line_coord"]
	vehicle["road_center"] = route["road_center"]
	vehicle["target_coord"] = route["target_coord"]
	vehicle["heading"] = route["heading"]
	if vehicle["axis"] == "x":
		vehicle["z"] = route["line_coord"]
	else:
		vehicle["x"] = route["line_coord"]


func sync_visuals() -> void:
	player_node.visible = player["mode"] == "onfoot"
	player_node.position = Vector3(player["x"], 0.0, player["z"])
	player_node.rotation.y = player["heading"]

	for vehicle in vehicles:
		var node: Node3D = vehicle["node"]
		node.position = Vector3(vehicle["x"], 0.0, vehicle["z"])
		node.rotation.y = vehicle["heading"]

	for ped in pedestrians:
		var ped_node: Node3D = ped["node"]
		ped_node.visible = ped["alive"]
		ped_node.position = Vector3(ped["x"], 0.0, ped["z"])
		ped_node.rotation.y = ped["heading"]

	for pickup in pickups:
		var pickup_node: Node3D = pickup["node"]
		pickup_node.position = Vector3(pickup["x"], pickup["y"] + sin(pickup["bob"]) * 0.32, pickup["z"])
		pickup_node.rotation.y = pickup["bob"]


func update_camera(dt: float) -> void:
	var anchor := get_player_anchor()
	var mode := player["mode"]
	var target := Vector3(anchor["x"], 2.3 if mode == "vehicle" else 1.45, anchor["z"])

	var desired_pitch := 0.5 if mode == "vehicle" else 0.56
	var desired_distance := 13.5 if mode == "vehicle" else 10.5
	var desired_yaw := player["heading"] - (0.18 if mode == "vehicle" else 0.75)

	if not camera_dragging:
		camera_yaw = lerp_angle(camera_yaw, desired_yaw, dt * (2.4 if mode == "vehicle" else 4.2))
		camera_pitch = lerpf(camera_pitch, desired_pitch, dt * (1.4 if mode == "vehicle" else 2.1))
		camera_distance = lerpf(camera_distance, desired_distance, dt * (1.15 if mode == "vehicle" else 1.8))

	var horizontal := cos(camera_pitch) * camera_distance
	var offset := Vector3(cos(camera_yaw) * horizontal, sin(camera_pitch) * camera_distance, sin(camera_yaw) * horizontal)
	camera.global_position = target - offset
	camera.look_at(target)


func create_hud() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)

	hud_label = Label.new()
	hud_label.name = "HudLabel"
	hud_label.position = Vector2(18, 14)
	hud_label.size = Vector2(560, 300)
	hud_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	hud_label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	hud_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hud_label.add_theme_font_size_override("font_size", 17)
	layer.add_child(hud_label)


func update_hud() -> void:
	var stars := ""
	for _i in range(int(player["wanted"])):
		stars += "★"
	if stars == "":
		stars = "-"

	var speed := absf(player["speed"])
	var kmh := int(round(speed * 3.6))
	var mode_label := "W aucie" if player["mode"] == "vehicle" else "Na piechote"
	var state_label := "KONIEC GRY" if game_over else "AKTYWNA"

	hud_label.text = "MINI GTA / GODOT\n" \
		+ "Stan: %s\n" % state_label \
		+ "Cel: %s\n" % objective \
		+ "Tryb: %s\n" % mode_label \
		+ "Gotowka: %d\n" % int(player["cash"]) \
		+ "Poscig: %s\n" % stars \
		+ "Zdrowie: %d\n" % int(round(player["health"])) \
		+ "Predkosc: %d km/h\n\n" % kmh \
		+ "Sterowanie: WASD/strzalki, Shift, E, Spacja, R, mysz + kolko"


func distance_2d(ax: float, az: float, bx: float, bz: float) -> float:
	return Vector2(ax, az).distance_to(Vector2(bx, bz))


func get_axis(negative_action: String, positive_action: String) -> float:
	return (1.0 if Input.is_action_pressed(positive_action) else 0.0) - (1.0 if Input.is_action_pressed(negative_action) else 0.0)


func camera_relative_vector(local_x: float, local_forward: float) -> Vector2:
	var cy := cos(camera_yaw)
	var sy := sin(camera_yaw)
	return Vector2(local_x * cy - local_forward * sy, local_x * sy + local_forward * cy)


func compose_velocity(heading: float, forward: float, lateral: float) -> Vector2:
	var ch := cos(heading)
	var sh := sin(heading)
	return Vector2(ch * forward - sh * lateral, sh * forward + ch * lateral)


func project_local_velocity(heading: float, vx: float, vz: float) -> Vector2:
	var ch := cos(heading)
	var sh := sin(heading)
	return Vector2(vx * ch + vz * sh, -vx * sh + vz * ch)


func create_road_centers(size: float = WORLD_SIZE, block_size: float = BLOCK_SIZE) -> Array:
	var centers: Array = []
	var value := -size * 0.5 + block_size
	while value < size * 0.5:
		centers.append(value)
		value += block_size
	return centers


func create_sidewalk_guides(centers: Array) -> Array:
	var offset := ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH * 0.5
	var guides: Array = []
	for center in centers:
		guides.append(center - offset)
		guides.append(center + offset)
	guides.sort()
	return guides


func nearest_value(values: Array, value: float) -> float:
	var best := float(values[0])
	var best_distance := INF
	for candidate in values:
		var delta := absf(float(candidate) - value)
		if delta < best_distance:
			best = float(candidate)
			best_distance = delta
	return best


func next_node(values: Array, value: float, dir: int, edge: float) -> float:
	var stops: Array = [-edge]
	for center in values:
		stops.append(center)
	stops.append(edge)

	if dir > 0:
		for stop in stops:
			if float(stop) > value + 1.0:
				return float(stop)
	else:
		for index in range(stops.size() - 1, -1, -1):
			if float(stops[index]) < value - 1.0:
				return float(stops[index])
	return edge if dir > 0 else -edge


func get_lane_coord(axis: String, road_center: float, dir: int) -> float:
	if axis == "x":
		return road_center + (-LANE_OFFSET if dir > 0 else LANE_OFFSET)
	return road_center + (LANE_OFFSET if dir > 0 else -LANE_OFFSET)


func heading_from_axis(axis: String, dir: int) -> float:
	if axis == "x":
		return 0.0 if dir > 0 else PI
	return PI * 0.5 if dir > 0 else -PI * 0.5


func add_box(parent: Node3D, size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	instance.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 1.0
	instance.material_override = material
	instance.position = pos
	parent.add_child(instance)
	return instance
