use super::TopiaGenerationInput;

#[cfg_attr(not(mobile), allow(dead_code))]
pub const PROMPT_VERSION: &str = "topia-world-v2";

#[cfg_attr(not(mobile), allow(dead_code))]
pub const SYSTEM_PROMPT: &str = r#"You design a personal low-poly fantasy world for RealTopia.
Return exactly one valid JSON object and no markdown or explanation.
The JSON must conform to TopiaWorldConfig schemaVersion 1.
Only use the supplied prefab allowlist. Never return code, URLs, shaders, HTML or executable content.
The sky, lighting, weather and camera engine are owned by the app; generate only foreground objects, decorations, crops, anchors and landmark tags.
Every landmark anchorId must match an object anchorId in the same scene.
Keep the composition warm and readable, never face-like, uncanny, violent or photorealistic."#;

const DESIGN_BRIEF: &str = r#"Create one coherent personal floating domain with three connected views. It must feel inhabited by this specific user, not like a generic fantasy asset pack.

STYLE AND PERSONALIZATION
- Infer one clear visual language from the user profile: architectural silhouette, material feeling, recurring motif and a restrained 3-color accent palette.
- Carry that language through exterior, interior and garden, but do not force every user into the same cottage. Different profiles may produce a wind-sail home, botanical refuge, observatory cabin, crystalline workshop or another readable low-poly archetype.
- Translate experiences into symbolic decorations rather than literal text. Repeat 1-2 motifs across scenes to establish continuity.
- Keep shapes chunky, handcrafted, warm and legible at mobile scale. Avoid dense clutter, thin geometry, accidental faces and overlapping objects.

EXTERIOR — FLOATING HOME
- Build the main home on at least one floating-island near the origin.
- Give it a recognizable home silhouette assembled from architectural prefabs such as block, cone, cylinder, tower, door and round-window.
- Add 2-5 profile-specific features using sail, wind-chimes, observatory, crystal, plant, propeller or similar allowlisted decorations.
- A second smaller island is optional when it communicates the garden or another part of the user's life. Keep the main door and important silhouette readable from the initial camera.

INTERIOR — PERSONAL ROOM
- Start with exactly one room-shell and furnish a believable room inside its walls.
- Include a place to rest and a place for personal activity, then select only relevant furniture and decorations from sky-window, bed, nightstand, desk, chair, shelf, plant, hearth, rug, lantern and propeller.
- Echo the exterior palette and motif. Place objects on the floor or walls without collisions; do not create another building shell inside the room.

GARDEN — TASK LAND
- Build a smaller floating-island with a path and supporting decoration.
- Create one crop-plot for each useful active quest when space permits. Set taskId to the exact supplied quest id and params.crop to sunflower, tomato, lavender, pumpkin or herb.
- Use farm-shed, watering-orb, plant, crystal and cloud sparingly to complete the composition. Quest progress is applied later by the app; do not encode growth manually.

LANDMARKS AND TAGS
- Add landmarks only to meaningful personal objects, usually 2-5 per scene. Every landmark must reference an anchorId placed on its visible object in the same scene.
- Use exact supplied IDs in memoryIds, taskIds and personIds; never invent relation IDs.
- Labels, eyebrows and descriptions are Chinese UI copy. Keep labels short, descriptions specific and grounded in the supplied profile/context. Tags are hidden at the default camera distance and revealed by zoom, so they must enrich rather than explain the whole scene.

COMPOSITION
- Keep each scene centered around [0,0,0], with its important content generally within x -4..4, y -3..5 and z -4..4.
- Use scale and rotation to create variety. Preserve clear negative space and a strong silhouette from the supplied camera yaw/pitch.
- The app supplies the fantasy skybox, celestial body, lighting, weather, stars and interaction. Do not model or describe those systems in the scene objects."#;

const PREFABS: &str = "floating-island, block, cone, cylinder, door, round-window, tower, sail, wind-chimes, observatory, crystal, cloud, room-shell, sky-window, bed, nightstand, desk, chair, shelf, plant, hearth, rug, lantern, propeller, path, crop-plot, farm-shed, watering-orb";

pub fn build(input: &TopiaGenerationInput) -> Result<String, String> {
    let profile = serde_json::to_string(&input.profile).map_err(|error| error.to_string())?;
    let quests = serde_json::to_string(&input.context.quests).map_err(|error| error.to_string())?;
    let people = serde_json::to_string(&input.context.people).map_err(|error| error.to_string())?;
    let memories =
        serde_json::to_string(&input.context.memories).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"<user_profile>{profile}</user_profile>
<current_quests>{quests}</current_quests>
<known_people>{people}</known_people>
<known_memories>{memories}</known_memories>

{DESIGN_BRIEF}

Generate a distinct world reflecting this user's traits and experiences. Do not copy the mock home's exact layout; preserve its level of completeness and visual clarity while personalizing the result.
Use only these prefabs: {PREFABS}.

Prefab parameter guide:
- floating-island: radius, depth
- block: width, height, depth
- cone: radius, height, segments
- cylinder: radiusTop, radiusBottom, height, segments
- round-window: radius
- tower: radius, height
- wind-chimes: pieces
- path: width, depth
- crop-plot: crop
Other prefabs use their built-in proportions and are varied with position, rotation, scale and colors.

Required JSON shape:
{{
  "schemaVersion": 1,
  "id": "string",
  "ownerId": "string",
  "revision": 1,
  "generatedAt": "ISO timestamp",
  "source": "cloud",
  "profile": {{
    "homeName": "string",
    "archetype": "string",
    "traits": ["string"],
    "experiences": ["string"],
    "accentColors": [three integer RGB hex values]
  }},
  "scenes": {{
    "exterior": SceneConfig,
    "interior": SceneConfig,
    "garden": SceneConfig
  }}
}}

SceneConfig is:
{{
  "camera": {{ "yaw": number, "pitch": number }},
  "objects": [{{
    "id": "unique string",
    "prefab": "allowlisted prefab",
    "position": [x,y,z],
    "rotation": [x,y,z],
    "scale": [x,y,z],
    "colors": [integer RGB hex values],
    "params": {{ "bounded primitive parameters": "number|string|boolean" }},
    "anchorId": "optional unique string",
    "taskId": "optional exact quest id",
    "animation": "optional float|spin|sway"
  }}],
  "landmarks": [{{
    "id": "string",
    "anchorId": "matching object anchorId",
    "location": "exterior|interior|garden",
    "emoji": "one emoji",
    "label": "short Chinese label",
    "eyebrow": "short category",
    "description": "Chinese description tied to the user",
    "fallbackPlacement": {{ "left": "percentage", "top": "percentage" }},
    "memoryIds": ["known memory id"],
    "taskIds": ["exact quest id"],
    "personIds": ["exact known person id"]
  }}]
}}

Limits: 8-28 objects per scene, at most 8 landmarks per scene, coordinates -8..8, scale 0.1..4, colors 0..16777215. Use radians for rotation. Include one crop-plot per active quest where practical. Use crop params sunflower|tomato|lavender|pumpkin|herb. Return JSON only."#
    ))
}
