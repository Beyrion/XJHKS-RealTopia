use super::{TopiaAssetLayer, TopiaGenerationInput, TopiaRenderStyleConfig, TopiaWorldConfig};

pub const PROMPT_VERSION: &str = "topia-studio-v4";

pub const CONCEPT_SYSTEM_PROMPT: &str = r#"You are the visual director for RealTopia, a personal fantasy space. Return one JSON object only. Invent boldly, but keep the result warm, readable and suitable for a low-poly mobile scene."#;

pub const WORLD_SYSTEM_PROMPT: &str = r#"You design a personal low-poly fantasy world for RealTopia.
Return exactly one valid JSON object and no markdown or explanation.
The JSON must conform to TopiaWorldConfig schemaVersion 2. Only use the supplied prefab allowlist.
The world always contains a floating home, a clickable main door, a separate floating crop island and one believable interior room.
Sky identity, decorations, architecture and materials may change radically between worlds. Avoid generic cottages: a dream could become a whale-bone observatory, an upside-down botanical lantern, a paper-storm archive or another coherent fantasy domain.
Generate the sky's stable content and spatial identity only: celestial silhouette, recurring sky motifs, decoration density and drift. The app owns a fixed mood engine that remaps the generated base palette and light distribution consistently: sad adds rain and cool dim light, anxious accelerates cloud/sky motion, angry creates a warm storm pulse, tired deepens night and stars, calm softens mist, joyful brightens sun and sparkles. Do not encode current mood, rain, exposure or transient weather into objects.
Decorations, crops and souvenirs are portable personal assets. Represent supplied memories symbolically, give every souvenir its own anchor and landmark, and never invent relation IDs.
Never return code, URLs, shaders, HTML, executable content, violence, accidental faces or photorealism."#;

pub const REVIEW_SYSTEM_PROMPT: &str = r#"You are RealTopia's strict art director and schema reviewer. Review the candidate against every supplied constraint. Return exactly one compact JSON object with approved, issues, and repairInstructions. Do not rewrite the world and do not return markdown."#;

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

Treat the backend-selected rendering style as the visual medium/filter for the whole world. Keep its identity coherent across architecture, rooms and portable decoration while retaining low-poly mobile feasibility. Return:
{{"title":"Chinese name","archetype":"short Chinese fantasy concept","story":"80-160 Chinese chars","architecture":"silhouette and spatial rules","materials":["..."],"motifs":["..."],"imageryTranslation":[{{"source":"selected phrase","abstractTraits":["spatial/material/emotional association"],"forbiddenLiteralObjects":["literal noun to avoid"]}}],"palette":[three integer RGB colors],"sky":{{"theme":"distinct fantasy identity","motifs":["aurora-ribbon|paper-birds|jellyfish-lights|floating-petals|star-dust|crystal-moons|cloud-whales"],"celestialShape":"ringed-orb|crescent|twin-moons|prism|lantern-sun","decorationDensity":0.0-1.0,"drift":0.0-1.0,"top":integer,"mid":integer,"low":integer,"aurora":integer,"celestial":integer,"stars":integer,"fog":integer,"magic":0.0-1.0}}}}
Make it personal, surprising and coherent. Return JSON only."#
    ))
}

pub fn build_world(
    input: &TopiaGenerationInput,
    concept: &str,
    inherited: &TopiaAssetLayer,
    render_style: &TopiaRenderStyleConfig,
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

Generate three connected views. Exterior needs a main floating home, a door object with anchorId portal-interior, and a visible garden-island object with anchorId portal-garden. Interior starts with exactly one room-shell. Garden has a floating-island and crop-plots linked to exact active quest IDs.

NON-LITERAL IMAGERY RULE: imagery choices control composition, atmosphere, rhythm, abstraction and associative details only. Do not instantiate a chosen noun as the same concrete object, prefab, landmark, label or description. Do not quote choice text. Only durable_memories/runtime_context may independently justify literal personal objects. Use the selected render style consistently as a global material language; copy the supplied renderStyle object unchanged into the root JSON.

Classify every object with layer: structure, decoration, crop or souvenir. Structure belongs only to this Topia. Decoration/crop/souvenir are portable and must survive future Topia switches. For each meaningful memory, create at most one symbolic souvenir with a unique anchorId, subtle sparkle animation, and a matching landmark containing exact memoryIds. All landmarks are hidden at default zoom and revealed by the app after zoom.

Use only: {PREFABS}.
Required root shape:
{{"schemaVersion":2,"id":"unique","ownerId":"local-user","revision":1,"generatedAt":"ISO timestamp","source":"cloud","profile":{{"homeName":"...","archetype":"...","traits":[],"experiences":[],"accentColors":[0,0,0]}},"sky":{{"theme":"...","motifs":["..."],"celestialShape":"...","decorationDensity":0.6,"drift":0.4,"top":0,"mid":0,"low":0,"aurora":0,"celestial":0,"stars":0,"fog":0,"magic":0.7}},"renderStyle":{style},"scenes":{{"exterior":Scene,"interior":Scene,"garden":Scene}}}}
Scene={{"camera":{{"yaw":number,"pitch":number}},"objects":[{{"id":"...","prefab":"...","layer":"structure|decoration|crop|souvenir","position":[x,y,z],"rotation":[x,y,z],"scale":[x,y,z],"colors":[],"params":{{}},"anchorId":"optional","taskId":"optional","memoryIds":[],"animation":"optional float|spin|sway|sparkle"}}],"landmarks":[{{"id":"...","anchorId":"matching anchor","location":"exterior|interior|garden","emoji":"one emoji","label":"short Chinese","eyebrow":"...","description":"...","fallbackPlacement":{{"left":"50%","top":"50%"}},"memoryIds":[],"taskIds":[],"personIds":[]}}]}}
Limits: 8-32 objects per scene, at most 8 landmarks, coordinates -8..8, scale .1..4, colors 0..16777215. Return JSON only."#
    ))
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

Audit this candidate. Reject it if: a selected imagery noun was copied literally into a concrete object, landmark, label or description without independent durable-memory evidence; the render style is incoherent; required portals/room/crop island are missing; portable assets or exact relation IDs were lost; souvenirs lack symbolic transformation, anchors, sparkle or landmarks; any scene is cluttered or visually incoherent.

Meaningful correlation is required, but it must be indirect: imagery should be recognizable through spatial rhythm, silhouette, texture, palette, atmosphere or emotional tension—not noun copying. Return exactly:
{{"approved":true|false,"issues":["specific issue"],"repairInstructions":"precise compact instructions; empty only when approved"}}"#,
        validation_error.unwrap_or("none")
    ))
}

pub fn build_revision(
    input: &TopiaGenerationInput,
    candidate: &TopiaWorldConfig,
    inherited: &TopiaAssetLayer,
    issues: &[String],
    instructions: &str,
) -> Result<String, String> {
    let profile = serde_json::to_string(&input.profile).map_err(|error| error.to_string())?;
    let context = serde_json::to_string(&input.context).map_err(|error| error.to_string())?;
    let assets = serde_json::to_string(inherited).map_err(|error| error.to_string())?;
    let world = serde_json::to_string(candidate).map_err(|error| error.to_string())?;
    let issues = serde_json::to_string(issues).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"<abstract_imagery_signals>{profile}</abstract_imagery_signals>
<runtime_context>{context}</runtime_context>
<required_portable_assets>{assets}</required_portable_assets>
<candidate_topia>{world}</candidate_topia>
<review_issues>{issues}</review_issues>
<repair_instructions>{instructions}</repair_instructions>

Repair the candidate and return one complete schemaVersion 2 TopiaWorldConfig JSON object. Preserve its backend-selected renderStyle exactly. Fix every review and schema issue. Preserve every valid portable asset and exact relation ID. Enforce non-literal imagery: selected nouns may influence only abstraction, spatial rhythm, silhouette, texture, palette and atmosphere unless independently supported by runtime memory. Return JSON only."#
    ))
}

pub fn build_iteration(
    current: &TopiaWorldConfig,
    inherited: &TopiaAssetLayer,
    input: &TopiaGenerationInput,
) -> Result<String, String> {
    let world = serde_json::to_string(current).map_err(|error| error.to_string())?;
    let assets = serde_json::to_string(inherited).map_err(|error| error.to_string())?;
    let context = serde_json::to_string(&input.context).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"<current_topia>{world}</current_topia>
<existing_portable_assets>{assets}</existing_portable_assets>
<latest_runtime_context>{context}</latest_runtime_context>

This is an ITERATION, not a redesign. Keep the current architecture, sky, palette, camera and established motifs. Return one complete schemaVersion 2 TopiaWorldConfig. Preserve every existing structure and portable asset. Add or gently evolve only decorations, crop-plots and souvenirs justified by newly completed/progressed quests, changed relationships or memories. Never delete a souvenir. Avoid duplicates by memoryIds/taskIds. Increase revision by one. Use only {PREFABS}. Return JSON only."#
    ))
}
