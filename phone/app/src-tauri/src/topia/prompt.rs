use super::{TopiaAssetLayer, TopiaGenerationInput, TopiaRenderStyleConfig, TopiaWorldConfig};

pub const PROMPT_VERSION: &str = "topia-residential-harness-v5";

pub const DESIGN_SYSTEM_PROMPT: &str = "Translate abstract choices into a concrete architectural design brief. Return compact JSON only. Specify buildable shapes, real functional objects, spatial connections, materials and a coordinated palette. Do not merely repeat poetic imagery or change colors.";

pub fn build_design_brief(
    input: &TopiaGenerationInput,
    recent: &str,
    variation: u64,
) -> Result<String, String> {
    let profile = serde_json::to_string(&input.profile).map_err(|e| e.to_string())?;
    Ok(format!(
        r#"<four_page_choices>{profile}</four_page_choices>
<recent_geometry_do_not_repeat>{recent}</recent_geometry_do_not_repeat>
<variation>{variation}</variation>
Translate all four pages: personality and change preference -> circulation and social/private zones; sensations and spatial breathing -> voids, island outline, vertical rhythm; secret imagery -> specific joints, folded/arched/branched massing and meaningful objects; material preference -> surfaces and fine craft details. Use associations, not literal copies of selected nouns. Make at least THREE geometric differences from recent worlds, one per location. A different palette is NOT a difference. Avoid repeating a circular island, back-wall desk, right-side bed and three straight crop beds.
The interior MUST remain a real inhabited room: continuous floor, enclosing walls, a door, a window, a bed, an actual usable desk with its chair, storage and clear walking space. Never design a trophy plaza, showroom or a flat grid of souvenirs. Memories are at most three small exhibits on one wall-side display cabinet, subordinate to everyday furniture.
Return {{"keywords":[4-8 concrete design terms],"habitatForm":"one supported habitat","architectureStyle":"one supported style","layout":"one supported layout","exterior":"island outline, 3-6 concrete connected masses, entry, bridges and voids","interior":"residential rectangular room or supported loft; sleeping/work/storage zones and clear circulation","garden":"crop bed topology and paths, terracing with retaining supports","materials":[2-3 materials],"palette":[3 colors],"details":[3 buildable craft details]}}.
Habitats: cloud-house, courtyard-compound, cantilever-villa, reef-grotto, tower-village, stilt-lodge, temple-terrace, wandering-capsule. Styles: cloud-organic, cycladic-white, chinese-thatch, chinese-red-wall, jiangnan-white-wall, american-modern, coral-fantasy, ancient-greek. Layouts: clustered, courtyard, vertical, cantilevered, terraced, ring, linear, scattered. Maximum 220 words. JSON only."#
    ))
}

pub const CONCEPT_SYSTEM_PROMPT: &str = r#"You are the visual director for RealTopia, a personal fantasy space. Return one JSON object only. Invent boldly and reject the assumption that a home must be a cottage: the habitat itself may be a cloud, courtyard, reef, temple, tower village, stilt lodge, modern cantilever or wandering capsule. Keep the dominant silhouette instantly readable, warm and suitable for a low-poly mobile scene."#;

pub const WORLD_SYSTEM_PROMPT: &str = r#"You design a personal low-poly fantasy world for RealTopia.
Return exactly one valid JSON object and no markdown or explanation.
The JSON must conform to TopiaWorldConfig schemaVersion 2. Only use the supplied prefab allowlist.
The world always contains a floating home, a clickable main door, a separate floating crop island and one believable interior room.
Sky identity, decorations, architecture and materials may change radically between worlds. Avoid generic cottages and repeated house massing. The habitat itself may be a giant inhabited cloud, clustered Cycladic volumes, a Chinese thatched stilt lodge, a red-wall courtyard, a Jiangnan white-wall compound, an American modern cantilever villa, a colorful coral grotto, an ancient Greek terrace, a tower village or a wandering capsule. Architecture must change the load-bearing silhouette and spatial layout—not merely colors, roof tint or decorations.
Generate the sky's stable content and spatial identity only: celestial silhouette, recurring sky motifs, decoration density and drift. The app owns a fixed mood engine that remaps the generated base palette and light distribution consistently: sad adds rain and cool dim light, anxious accelerates cloud/sky motion, angry creates a warm storm pulse, tired deepens night and stars, calm softens mist, joyful brightens sun and sparkles. Do not encode current mood, rain, exposure or transient weather into objects.
Decorations, crops and souvenirs are portable personal assets. Represent supplied memories symbolically, give every souvenir its own anchor and landmark, and never invent relation IDs.
When a cloud, crystal or plant is part of the habitat's load-bearing mass rather than decoration, keep layer structure and set params.structural=true so it stays attached to that Topia.
Never return code, URLs, shaders, HTML, executable content, violence, accidental faces or photorealism."#;

pub const SCENE_SYSTEM_PROMPT: &str = r#"You design one scene of a personal low-poly fantasy world for RealTopia.
Return exactly one valid Scene JSON object and no markdown or explanation. Do not return the world root.
Only use the prefab allowlist and exact relation IDs supplied by the user prompt. Keep object transforms mobile-friendly and all anchors unique within the scene.
Selected imagery is an abstract associative signal, never an object shopping list. Preserve portable personal assets relevant to this scene. Architecture must change dominant massing rather than dressing the same cottage. When cloud, crystal or plant geometry is structural, use layer structure with params.structural=true. Never return code, URLs, shaders, HTML, executable content, violence, accidental faces or photorealism."#;

pub const BLUEPRINT_SYSTEM_PROMPT: &str = r#"You are the architectural creative director for one RealTopia scene. Return one compact SceneBlueprint JSON object only. Design actual mass sizes, supported vertical connections, functional zones and garden topology; color-only variation is a failure. Do not return the runtime scene DSL, IDs, portals or private relation objects. The model owns the geometric design; Rust compiles and validates physical safety. Selected imagery is an associative signal, not a shopping list."#;

pub const REVIEW_SYSTEM_PROMPT: &str = r#"You are RealTopia's strict art director and schema reviewer. Review the candidate against every supplied constraint. Return exactly one compact JSON object with approved, issues, and repairInstructions. Do not rewrite the world and do not return markdown."#;

pub const REPAIR_SYSTEM_PROMPT: &str = r#"You repair JSON generated for RealTopia. Return one complete replacement JSON object only, with no markdown or explanation. Treat IDs, relations, supported prefabs and navigable scene structure as hard runtime requirements. Treat aesthetic guidance, optional details and exact numeric presentation as soft preferences: keep the creative intent, normalize them simply, and do not add complexity merely to satisfy wording."#;

const PREFABS: &str = "floating-island, block, cone, cylinder, door, round-window, tower, sail, wind-chimes, observatory, crystal, cloud, room-shell, sky-window, bed, nightstand, desk, chair, shelf, plant, hearth, rug, lantern, propeller, path, crop-plot, farm-shed, watering-orb";

pub fn build_concept(
    input: &TopiaGenerationInput,
    render_style: &TopiaRenderStyleConfig,
) -> Result<String, String> {
    let profile = serde_json::to_string(&input.profile).map_err(|error| error.to_string())?;
    let style = serde_json::to_string(render_style).map_err(|error| error.to_string())?;
    let memories =
        serde_json::to_string(&input.context.memories).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"<selected_imagery>{profile}</selected_imagery>
<durable_memories>{memories}</durable_memories>
<backend_selected_render_style>{style}</backend_selected_render_style>

Create a distinctive art direction. The selections are abstract associative signals, never an object shopping list. Translate them through spatial rhythm, silhouette, negative space, texture, emotional tension, color relationships and degrees of order/chaos. A selected noun MUST NOT directly become that noun in the world. For example, choosing a paper boat must not cause a paper boat object; it may suggest lightness, folded planes, drifting or departure. A literal object is allowed only when a separate durable memory independently requires it. Never copy selected-imagery wording into object labels or descriptions.

Make architecture a primary act of imagination, not a generic shell. Select one exact habitatForm, architectureStyle and layout from the compiler allowlists in the response schema. Vary structural massing radically across generations. A cloud-house must be made from inhabited cloud volumes; a courtyard must read as enclosing wings and a gate; a cantilever villa needs offset horizontal slabs; a reef grotto needs branching mineral massing. Tower villages, stilt lodges, temple terraces and wandering capsules must each have unmistakable silhouettes. Do not default to a cottage plus themed props.

Treat the backend-selected rendering style as the visual medium/filter for the whole world. Keep its identity coherent across architecture, rooms and portable decoration while retaining low-poly mobile feasibility. Return:
{{"title":"Chinese name","archetype":"short Chinese fantasy concept","story":"under 60 Chinese chars","habitatForm":"cloud-house|courtyard-compound|cantilever-villa|reef-grotto|tower-village|stilt-lodge|temple-terrace|wandering-capsule","architectureStyle":"cloud-organic|cycladic-white|chinese-thatch|chinese-red-wall|jiangnan-white-wall|american-modern|coral-fantasy|ancient-greek","layout":"clustered|courtyard|vertical|cantilevered|terraced|ring|linear|scattered","palette":[three colors],"sky":{{"theme":"distinct fantasy identity","motifs":["aurora-ribbon|paper-birds|jellyfish-lights|floating-petals|star-dust|crystal-moons|cloud-whales"],"celestialShape":"ringed-orb|crescent|twin-moons|prism|lantern-sun","decorationDensity":0.0-1.0,"drift":0.0-1.0,"top":"color","mid":"color","low":"color","aurora":"color","celestial":"color","stars":"color","fog":"color","magic":0.0-1.0}}}}
Colors may be 24-bit integers, #RRGGBB strings or [r,g,b] arrays; the backend normalizes them. Optional descriptive fields may be concise or omitted. Focus on a useful creative direction rather than satisfying unnecessary detail.
Follow any concrete_design_brief: resolve it into actual structural choices rather than another poetic concept. Keep story under 60 Chinese chars. Make it personal, surprising and coherent. Return JSON only."#
    ))
}

pub fn build_scene(
    input: &TopiaGenerationInput,
    concept: &str,
    inherited: &TopiaAssetLayer,
    render_style: &TopiaRenderStyleConfig,
    location: &str,
) -> Result<String, String> {
    let context = serde_json::to_string(&input.context).map_err(|error| error.to_string())?;
    let assets = serde_json::to_string(inherited).map_err(|error| error.to_string())?;
    let imagery = serde_json::to_string(&input.profile).map_err(|error| error.to_string())?;
    let style = serde_json::to_string(render_style).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"<approved_art_direction>{concept}</approved_art_direction>
<abstract_imagery_signals>{imagery}</abstract_imagery_signals>
<backend_selected_render_style>{style}</backend_selected_render_style>
<runtime_context>{context}</runtime_context>
<portable_assets_from_previous_topia>{assets}</portable_assets_from_previous_topia>

Generate only the {location} Scene for a three-view connected Topia. Do not return the world root or either other scene.

Location requirements:
- exterior: 8-14 objects. Build the main floating home, a door with anchorId portal-interior, and a visible garden-island object with anchorId portal-garden.
- interior: 8-12 objects. Start with exactly one room-shell and make one believable, uncluttered room.
- garden: 8-12 objects. Include a floating-island and crop-plots linked only to exact active quest IDs.

NON-LITERAL IMAGERY RULE: imagery choices control composition, atmosphere, rhythm, abstraction and associative details only. Do not instantiate a chosen noun as the same concrete object, prefab, landmark, label or description. Do not quote choice text. Only durable_memories/runtime_context may independently justify literal personal objects. Use the selected render style consistently as a global material language; copy the supplied renderStyle object unchanged into the root JSON.

Classify every object with layer: structure, decoration, crop or souvenir. Structure belongs only to this Topia. Decoration/crop/souvenir are portable and must survive future Topia switches. For each meaningful memory relevant to this location, create at most one symbolic souvenir with a unique anchorId, subtle sparkle animation, and a matching landmark containing exact memoryIds. All landmarks are hidden at default zoom and revealed by the app after zoom. Use the supplied render style consistently as the material language for this scene; the backend assembles the root world and owns the canonical renderStyle object.
If a cloud, crystal or plant is used as the house body or another load-bearing architectural mass, mark it layer structure and set params.structural=true. Decorative instances must remain layer decoration.

Use only: {PREFABS}.
Required response shape:
{{"camera":{{"yaw":number,"pitch":number}},"objects":[{{"id":"...","prefab":"...","layer":"structure|decoration|crop|souvenir","position":[x,y,z],"rotation":[x,y,z],"scale":[x,y,z],"colors":[],"params":{{}},"anchorId":"optional","taskId":"optional","memoryIds":[],"animation":"optional float|spin|sway|sparkle"}}],"landmarks":[{{"id":"...","anchorId":"matching anchor","location":"{location}","emoji":"one emoji","label":"short Chinese","eyebrow":"...","description":"...","fallbackPlacement":{{"left":"50%","top":"50%"}},"memoryIds":[],"taskIds":[],"personIds":[]}}]}}
Keep geometry concise: prefer simple transforms and omit optional params, landmarks and animations unless they add visible meaning. At most 4 landmarks; coordinates -8..8; scale .1..4. Colors may be integers, #RRGGBB strings or [r,g,b] arrays. Return the Scene JSON only."#
    ))
}

pub fn build_scene_blueprint(
    input: &TopiaGenerationInput,
    concept: &str,
    render_style: &TopiaRenderStyleConfig,
    location: &str,
) -> Result<String, String> {
    let imagery = serde_json::to_string(&input.profile).map_err(|error| error.to_string())?;
    let style = serde_json::to_string(render_style).map_err(|error| error.to_string())?;
    let geometry = match location {
        "exterior" => {
            r#""islandShape":"crescent","islandAspect":1.2,"islandDepth":1.4,"massing":[{"kind":"block","position":[-1,0],"size":[1.6,1.5,1.2],"rotation":0},{"kind":"block","position":[1,0],"size":[1.2,2,1],"rotation":0},{"kind":"cone","position":[1,0],"size":[1.4,0.8,1.2],"rotation":0,"support":1}]"#
        }
        "interior" => {
            r#""roomShape":"rectangular","roomScale":[1.4,1.2],"furnishings":[{"kind":"bed","position":[-1.5,0.9],"rotation":0,"scale":0.9},{"kind":"desk","position":[1.6,-1],"rotation":0,"scale":0.95},{"kind":"chair","position":[1.6,0.15],"rotation":0,"scale":0.8},{"kind":"shelf","position":[0,-1.8],"rotation":1.57,"scale":0.9},{"kind":"nightstand","position":[-2.5,1.2],"rotation":0,"scale":0.8},{"kind":"plant","position":[2.4,1.2],"rotation":0,"scale":0.6}]"#
        }
        _ => {
            r#""islandShape":"hexagonal","islandAspect":1.1,"islandDepth":1.6,"plots":[[-1.4,-0.7],[1.3,-0.4],[0,1.2]]"#
        }
    };
    let geometry_rules = match location {
        "exterior" => "Required top-level keys: islandShape, islandAspect, islandDepth, massing. islandShape: oval|crescent|split|elongated|terraced|hexagonal; aspect .65..1.45, depth .9..2.8. massing must have 3-6 connected/asymmetric volumes with x -2..2,z -1.6..1.6, size .4..3.5, kind block|cylinder|cone|cloud|crystal|tower. support is an optional earlier mass index for an attached roof/storey, never unsupported floating slabs. Vary footprint, count, roof hierarchy and voids.",
        "interior" => "Required top-level keys: roomShape, roomScale, furnishings. roomShape MUST be rectangular or terraced-loft: a normal inhabited room, not a ring/platform/trophy plaza. roomScale [1.1..1.5,1.1..1.5]. 6-8 furnishings; MUST include bed, desk, chair and shelf. Bed and work desk occupy opposite sides, chair faces its desk within 1.2 units, shelf against rear wall, central aisle at least 1.2 units wide from front entry. Use real enclosing walls, continuous floor, window and doorway; loft needs load-bearing supports, stairs and rails. Bed x +/-1.3..1.6,z .7..1; desk on opposite side x +/-1.3..1.7,z -1.2..-.8; shelf x near 0,z -1.8. Avoid a circular scatter of objects. Rust reserves one side-wall display cabinet for at most three SMALL keepsakes; do not use souvenirs to replace furniture. Features: at most one small plant or lamp, no observatory, giant crystal or outdoor pergola indoors. Floor heights are solved from actual rendered floors.",
        _ => "Required top-level keys: islandShape, islandAspect, islandDepth, plots. islandShape: oval|crescent|split|elongated|terraced|hexagonal; aspect .65..1.45, depth .9..2.8. plots MUST be a top-level array of 3-5 numeric [x,z] pairs with x -2.3..2.3,z -2..2, not objects or text. Use rings, offset courtyards, stepped terraces or branching routes, not always three-in-a-row. Retaining supports are created by Rust. Do not nest plots inside garden/scenes/geometry.",
    };
    Ok(format!(
        r##"<art_direction>{concept}</art_direction>
<abstract_imagery>{imagery}</abstract_imagery>
<render_style>{style}</render_style>

Describe a compact {location} scene blueprint. All positions MUST be [x,z], exactly TWO numbers, never [x,y,z]; Rust computes supported height. Copy habitatForm, architectureStyle and layout from the approved art direction so all three views belong to one place. If the concept omitted them, choose one exact allowlisted value for each. The exterior's dominant massing must visibly embody habitatForm; do not fall back to a cottage. The model owns structural geometry and functional zoning using the fields below; Rust only clamps unsafe transforms, adds supports/navigation and preserves personal relation IDs. Do not generate runtime IDs or landmarks. Imagery is associative, not literal copying.

Return exactly:
{{{geometry},"density":0.5,"cameraYaw":0.55,"cameraPitch":0.6,"habitatForm":"cloud-house|courtyard-compound|cantilever-villa|reef-grotto|tower-village|stilt-lodge|temple-terrace|wandering-capsule","architectureStyle":"cloud-organic|cycladic-white|chinese-thatch|chinese-red-wall|jiangnan-white-wall|american-modern|coral-fantasy|ancient-greek","layout":"clustered|courtyard|vertical|cantilevered|terraced|ring|linear|scattered","silhouette":"short load-bearing spatial rule","features":[{{"kind":"tower|sail|wind-chimes|observatory|crystal|cloud|sky-window|plant|hearth|rug|lantern|propeller|path|farm-shed|watering-orb","color":"#RRGGBB","emphasis":0.5}}]}}
The geometry fields at the START of this schema are REQUIRED. Their example values illustrate syntax only: invent your own coordinates, sizes, counts and shapes to implement the concrete design brief. Never copy the example geometry.

Geometry constraints (only your target location):
{geometry_rules}
Use 2-4 location-appropriate features. Non-airborne objects must touch ground/floor; emphasis affects size only, never altitude. No float animation for furniture, plants, crystals or farm equipment. Keep under 380 words. Return JSON only."##
    ))
}

pub const DETAIL_SYSTEM_PROMPT: &str = "You refine a buildable miniature world, not merely recolor it. Return compact JSON only. Preserve architecture and circulation. Add a coherent craft layer with useful ground-supported objects and clear negative space; never output full scene DSL.";

pub fn build_detail_plan(
    world: &TopiaWorldConfig,
    brief: &str,
    previous: Option<&str>,
) -> Result<String, String> {
    let geometry = serde_json::json!({"exterior":super::harness::spatial_summary(&world.scenes.exterior),"interior":super::harness::spatial_summary(&world.scenes.interior),"garden":super::harness::spatial_summary(&world.scenes.garden)});
    Ok(format!(
        r#"<concrete_brief>{brief}</concrete_brief><existing_geometry>{geometry}</existing_geometry>
The exterior island radius is 4.8, garden 5.2, and room width/depth are enlarged 1.1-1.5x. Refine three spacious scenes with deliberate pathways, thresholds, craft and resting corners; do not fill every gap. Return {{"details":[{{"location":"exterior|interior|garden","kind":"pergola|planter-box|stone-path|balustrade|book-nook","position":[x,z],"rotation":radians,"scale":0.55-1.25}}]}}. Exterior/garden: 2-3 additions each. Interior: at most TWO small book-nook/planter-box accents against a wall; no indoor pergola, stone path, trophy grid or obstructed central aisle. Keep real bed, usable desk/chair and storage prominent; souvenirs stay small on the reserved display cabinet, not across the floor. Maximum eight additions, x -3.8..3.8,z -3..3. Keep door access, working/sleeping circulation and crop beds clear. Rust solves floor contact and collisions. No relations, IDs or floating geometry. Maximum 250 words.
<previous_detail_plan>{}</previous_detail_plan>
{}"#,
        previous.unwrap_or("none"),
        if previous.is_some() {
            "This is a SECOND PASS: critically inspect the previous plan against the geometry and brief. Improve spacing, functional variety and small-scale craftsmanship; replace clutter or redundant features. Return the complete improved compact details array, not an explanation."
        } else {
            "This is the FIRST PASS: design the craft layer."
        }
    ))
}

pub fn build_scene_revision(
    input: &TopiaGenerationInput,
    concept: &str,
    inherited: &TopiaAssetLayer,
    render_style: &TopiaRenderStyleConfig,
    location: &str,
    candidate: &super::TopiaSceneConfig,
    issues: &[String],
    instructions: &str,
) -> Result<String, String> {
    let base = build_scene(input, concept, inherited, render_style, location)?;
    let candidate = serde_json::to_string(candidate).map_err(|error| error.to_string())?;
    let issues = serde_json::to_string(issues).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"{base}

<candidate_{location}_scene>{candidate}</candidate_{location}_scene>
<review_issues>{issues}</review_issues>
<repair_instructions>{instructions}</repair_instructions>

Repair this scene against all review issues. Preserve valid IDs and portable assets. Return one complete replacement Scene JSON only."#
    ))
}

pub fn build_json_repair(
    stage: &str,
    original_requirements: &str,
    invalid_output: &str,
    validation_error: &str,
) -> String {
    fn limited(value: &str, max_chars: usize) -> String {
        let mut output: String = value.chars().take(max_chars).collect();
        if value.chars().count() > max_chars {
            output.push_str("\n[truncated]");
        }
        output
    }

    let requirements = limited(original_requirements, 28_000);
    let invalid = limited(invalid_output, 28_000);
    let error = limited(validation_error, 2_000);
    format!(
        r#"<stage>{stage}</stage>
<original_requirements>{requirements}</original_requirements>
<invalid_candidate>{invalid}</invalid_candidate>
<validator_feedback>{error}</validator_feedback>

Produce a complete corrected replacement for this stage. Fix the validator feedback with the smallest useful change. Preserve hard runtime requirements, valid IDs, relations and portable assets. Keep soft aesthetic guidance flexible and do not invent unnecessary detail. Return JSON only."#
    )
}

pub fn build_review(
    input: &TopiaGenerationInput,
    concept: &str,
    candidate: &TopiaWorldConfig,
    inherited: &TopiaAssetLayer,
    validation_error: Option<&str>,
) -> Result<String, String> {
    let imagery = serde_json::to_string(&input.profile).map_err(|error| error.to_string())?;
    let memories =
        serde_json::to_string(&input.context.memories).map_err(|error| error.to_string())?;
    let assets = serde_json::to_string(inherited).map_err(|error| error.to_string())?;
    let world = serde_json::to_string(candidate).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"<abstract_imagery_signals>{imagery}</abstract_imagery_signals>
<approved_art_direction_and_forbidden_literals>{concept}</approved_art_direction_and_forbidden_literals>
<durable_memories>{memories}</durable_memories>
<required_portable_assets>{assets}</required_portable_assets>
<rust_validation_error>{}</rust_validation_error>
<candidate_topia>{world}</candidate_topia>

Audit this candidate. Reject it if: a selected imagery noun was copied literally into a concrete object, landmark, label or description without independent durable-memory evidence; the architecture is a generic cottage with only color or prop changes; the render style is incoherent; required portals/room/crop island are missing; portable assets or exact relation IDs were lost; souvenirs lack symbolic transformation, anchors, sparkle or landmarks; any scene is cluttered or visually incoherent.

Meaningful correlation is required, but it must be indirect: imagery should be recognizable through spatial rhythm, silhouette, texture, palette, atmosphere or emotional tension—not noun copying. Return exactly:
{{"approved":true|false,"issues":["specific issue"],"repairInstructions":"precise compact instructions; empty only when approved"}}"#,
        validation_error.unwrap_or("none")
    ))
}

pub const ITERATION_SYSTEM_PROMPT: &str = "Propose a compact, meaningful delta for an existing personal world. Return JSON only. Never rewrite geometry, cameras or architecture. Only use real supplied memory/task IDs and supported symbolic features.";

pub fn build_iteration(
    current: &TopiaWorldConfig,
    inherited: &TopiaAssetLayer,
    input: &TopiaGenerationInput,
) -> Result<String, String> {
    let context = serde_json::to_string(&input.context).map_err(|e| e.to_string())?;
    let represented: Vec<_> = inherited
        .memories
        .iter()
        .map(|m| (&m.source_memory_ids, &m.source_task_ids))
        .collect();
    let known = serde_json::to_string(&represented).map_err(|e| e.to_string())?;
    Ok(format!(
        r##"This is an ITERATION, not a redesign. Keep current architecture, sky, palette, cameras and every personal object. Never delete a souvenir. The backend owns preservation and safe placement; do not reproduce the existing scene JSON.
<identity>{} / {}</identity>
<already_represented_relations>{known}</already_represented_relations>
<latest_runtime_context>{context}</latest_runtime_context>
Return {{"additions":[{{"location":"exterior|interior|garden","kind":"crystal|plant|lantern|wind-chimes|observatory|watering-orb","color":"#RRGGBB","memoryIds":["exact new memory ID"],"taskId":"optional exact new quest ID"}}]}}.
At most six compact symbolic additions, justified ONLY by unrepresented memories or active tasks. An empty additions list is valid. No new personal IDs, no arbitrary furniture, no transforms or floating heights. Maximum 200 words. JSON only."##,
        current.profile.home_name, current.profile.archetype
    ))
}
