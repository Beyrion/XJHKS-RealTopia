mod prompt;

#[cfg(mobile)]
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const WORLD_FILE: &str = "topia-studio-v2.json";
const LEGACY_WORLD_FILE: &str = "topia-world-v1.json";
const MOCK_WORLD: &str = include_str!("mock_world.json");

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TopiaLocation {
    Exterior,
    Interior,
    Garden,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TopiaPrefab {
    FloatingIsland,
    Block,
    Cone,
    Cylinder,
    Door,
    RoundWindow,
    Tower,
    Sail,
    WindChimes,
    Observatory,
    Crystal,
    Cloud,
    RoomShell,
    SkyWindow,
    Bed,
    Nightstand,
    Desk,
    Chair,
    Shelf,
    Plant,
    Hearth,
    Rug,
    Lantern,
    Propeller,
    Path,
    CropPlot,
    FarmShed,
    WateringOrb,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TopiaObjectLayer {
    #[default]
    Structure,
    Decoration,
    Crop,
    Souvenir,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaSkyConfig {
    theme: String,
    #[serde(default)]
    motifs: Vec<String>,
    #[serde(default = "default_celestial")]
    celestial_shape: String,
    #[serde(default = "default_sky_density")]
    decoration_density: f64,
    #[serde(default = "default_sky_drift")]
    drift: f64,
    top: u32,
    mid: u32,
    low: u32,
    aurora: u32,
    celestial: u32,
    stars: u32,
    fog: u32,
    magic: f64,
}

fn default_celestial() -> String {
    "ringed-orb".into()
}
fn default_sky_density() -> f64 {
    0.55
}
fn default_sky_drift() -> f64 {
    0.4
}

impl Default for TopiaSkyConfig {
    fn default() -> Self {
        Self {
            theme: "cloud-dream".into(),
            motifs: vec!["aurora-ribbon".into(), "star-dust".into()],
            celestial_shape: default_celestial(),
            decoration_density: default_sky_density(),
            drift: default_sky_drift(),
            top: 0x5abbd7,
            mid: 0x9898dd,
            low: 0xefafbd,
            aurora: 0x8cf5de,
            celestial: 0xffefaa,
            stars: 0xf3f6ff,
            fog: 0xcceaff,
            magic: 0.72,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaWorldProfile {
    home_name: String,
    archetype: String,
    traits: Vec<String>,
    experiences: Vec<String>,
    accent_colors: [u32; 3],
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaUserProfileInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
    summary: String,
    traits: Vec<String>,
    experiences: Vec<String>,
    preferences: Vec<String>,
    #[serde(default)]
    imagery: Vec<String>,
    #[serde(default)]
    sensations: Vec<String>,
    #[serde(default)]
    style_preferences: Vec<String>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TopiaRenderStyleKind {
    PainterlyOil,
    PlushToy,
    PaperCraft,
    GlazedCeramic,
    #[default]
    StorybookInk,
    CrystalDiorama,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaRenderStyleConfig {
    kind: TopiaRenderStyleKind,
    seed: u32,
    roughness: f64,
    metalness: f64,
    saturation: f64,
    contrast: f64,
    texture_strength: f64,
}

impl Default for TopiaRenderStyleConfig {
    fn default() -> Self {
        Self {
            kind: TopiaRenderStyleKind::StorybookInk,
            seed: 7319,
            roughness: 0.84,
            metalness: 0.02,
            saturation: 0.96,
            contrast: 1.05,
            texture_strength: 0.42,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaObjectConfig {
    id: String,
    prefab: TopiaPrefab,
    #[serde(default)]
    layer: TopiaObjectLayer,
    position: [f64; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rotation: Option<[f64; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scale: Option<[f64; 3]>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    colors: Vec<u32>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    params: HashMap<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    anchor_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    memory_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    animation: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaPlacement {
    left: String,
    top: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaLandmark {
    id: String,
    anchor_id: String,
    location: TopiaLocation,
    emoji: String,
    label: String,
    eyebrow: String,
    description: String,
    fallback_placement: TopiaPlacement,
    #[serde(default)]
    memory_ids: Vec<String>,
    #[serde(default)]
    task_ids: Vec<String>,
    #[serde(default)]
    person_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TopiaCamera {
    yaw: f64,
    pitch: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TopiaSceneConfig {
    camera: TopiaCamera,
    objects: Vec<TopiaObjectConfig>,
    landmarks: Vec<TopiaLandmark>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TopiaScenes {
    exterior: TopiaSceneConfig,
    interior: TopiaSceneConfig,
    garden: TopiaSceneConfig,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaGenerationMetadata {
    provider: String,
    model: String,
    prompt_version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaWorldConfig {
    schema_version: u8,
    id: String,
    owner_id: String,
    revision: u64,
    generated_at: String,
    source: String,
    profile: TopiaWorldProfile,
    #[serde(default)]
    sky: TopiaSkyConfig,
    #[serde(default)]
    render_style: TopiaRenderStyleConfig,
    scenes: TopiaScenes,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    generation: Option<TopiaGenerationMetadata>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaQuestContext {
    id: String,
    title: String,
    progress: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    person_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    priority: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reward: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaPersonContext {
    id: String,
    name: String,
    role: String,
    affinity: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaMemoryContext {
    id: String,
    title: String,
    meta: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    person_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    task_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mood: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    intensity: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    evidence: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    confidence: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    observed_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaRuntimeContext {
    #[serde(default)]
    quests: Vec<TopiaQuestContext>,
    #[serde(default)]
    people: Vec<TopiaPersonContext>,
    #[serde(default)]
    memories: Vec<TopiaMemoryContext>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaGenerationInput {
    profile: TopiaUserProfileInput,
    context: TopiaRuntimeContext,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct TopiaAssetScenes {
    #[serde(default)]
    exterior: Vec<TopiaObjectConfig>,
    #[serde(default)]
    interior: Vec<TopiaObjectConfig>,
    #[serde(default)]
    garden: Vec<TopiaObjectConfig>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct TopiaAssetLandmarks {
    #[serde(default)]
    exterior: Vec<TopiaLandmark>,
    #[serde(default)]
    interior: Vec<TopiaLandmark>,
    #[serde(default)]
    garden: Vec<TopiaLandmark>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaAssetLayer {
    #[serde(default)]
    objects: TopiaAssetScenes,
    #[serde(default)]
    landmarks: TopiaAssetLandmarks,
    #[serde(default)]
    memories: Vec<TopiaAssetMemory>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaAssetMemory {
    id: String,
    object_id: String,
    location: TopiaLocation,
    kind: String,
    label: String,
    created_at: String,
    #[serde(default)]
    source_memory_ids: Vec<String>,
    #[serde(default)]
    source_task_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TopiaStudioState {
    schema_version: u8,
    active_world_id: String,
    worlds: Vec<TopiaWorldConfig>,
    assets: TopiaAssetLayer,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_profile: Option<TopiaUserProfileInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_maintained_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_context_digest: Option<u64>,
    #[serde(default)]
    onboarding_completed: Option<bool>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    thumbnails: HashMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaWorldSummary {
    id: String,
    home_name: String,
    archetype: String,
    generated_at: String,
    active: bool,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    thumbnail: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaStudioPayload {
    active_world_id: String,
    worlds: Vec<TopiaWorldSummary>,
    assets: TopiaAssetLayer,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_profile: Option<TopiaUserProfileInput>,
    needs_onboarding: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TopiaGenerationProgress {
    mode: String,
    stage: String,
    progress: u8,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopiaGenerationReview {
    approved: bool,
    #[serde(default)]
    issues: Vec<String>,
    #[serde(default)]
    repair_instructions: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaSceneCrop {
    id: String,
    title: String,
    progress: u8,
    crop: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    person_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaWorldPayload {
    world: TopiaWorldConfig,
    crops: Vec<TopiaSceneCrop>,
    studio: TopiaStudioPayload,
}

fn scene_mut(world: &mut TopiaWorldConfig, location: TopiaLocation) -> &mut TopiaSceneConfig {
    match location {
        TopiaLocation::Exterior => &mut world.scenes.exterior,
        TopiaLocation::Interior => &mut world.scenes.interior,
        TopiaLocation::Garden => &mut world.scenes.garden,
    }
}

fn valid_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}

fn valid_vector(value: &[f64; 3], min: f64, max: f64) -> bool {
    value
        .iter()
        .all(|component| component.is_finite() && *component >= min && *component <= max)
}

fn valid_percentage(value: &str) -> bool {
    value
        .strip_suffix('%')
        .and_then(|number| number.parse::<f64>().ok())
        .is_some_and(|number| number.is_finite() && (0.0..=100.0).contains(&number))
}

fn validate_scene(scene: &TopiaSceneConfig, location: TopiaLocation) -> Result<(), String> {
    if !(8..=40).contains(&scene.objects.len()) {
        return Err(format!("{location:?} must contain 8..40 objects"));
    }
    if scene.landmarks.len() > 8 {
        return Err(format!("{location:?} contains too many landmarks"));
    }
    if !scene.camera.yaw.is_finite()
        || !(-3.2..=3.2).contains(&scene.camera.yaw)
        || !scene.camera.pitch.is_finite()
        || !(0.18..=1.08).contains(&scene.camera.pitch)
    {
        return Err(format!("{location:?} camera is out of range"));
    }
    let mut object_ids = HashSet::new();
    let mut anchors = HashSet::new();
    for object in &scene.objects {
        if !valid_text(&object.id, 64) || !object_ids.insert(object.id.as_str()) {
            return Err(format!(
                "{location:?} has an invalid or duplicate object id"
            ));
        }
        if !valid_vector(&object.position, -8.0, 8.0)
            || object.rotation.as_ref().is_some_and(|value| {
                !valid_vector(value, -std::f64::consts::TAU, std::f64::consts::TAU)
            })
            || object
                .scale
                .as_ref()
                .is_some_and(|value| !valid_vector(value, 0.1, 4.0))
        {
            return Err(format!("{} has an invalid transform", object.id));
        }
        if object.colors.len() > 8 || object.colors.iter().any(|color| *color > 0x00ff_ffff) {
            return Err(format!("{} has invalid colors", object.id));
        }
        if object.params.len() > 16
            || object.params.iter().any(|(key, value)| {
                !valid_text(key, 40)
                    || match value {
                        Value::Bool(_) => false,
                        Value::String(value) => value.chars().count() > 64,
                        Value::Number(value) => value
                            .as_f64()
                            .is_none_or(|number| !number.is_finite() || number.abs() > 20.0),
                        _ => true,
                    }
            })
        {
            return Err(format!("{} has invalid prefab parameters", object.id));
        }
        if object
            .animation
            .as_deref()
            .is_some_and(|value| !matches!(value, "float" | "spin" | "sway" | "sparkle"))
        {
            return Err(format!("{} has an invalid animation", object.id));
        }
        if let Some(anchor) = &object.anchor_id {
            if !valid_text(anchor, 64) || !anchors.insert(anchor.as_str()) {
                return Err(format!("{location:?} has an invalid or duplicate anchor"));
            }
        }
    }
    let mut landmark_ids = HashSet::new();
    for landmark in &scene.landmarks {
        if landmark.location != location
            || !valid_text(&landmark.id, 64)
            || !landmark_ids.insert(landmark.id.as_str())
            || !anchors.contains(landmark.anchor_id.as_str())
            || !valid_text(&landmark.emoji, 8)
            || !valid_text(&landmark.label, 36)
            || !valid_text(&landmark.eyebrow, 36)
            || !valid_text(&landmark.description, 360)
            || !valid_percentage(&landmark.fallback_placement.left)
            || !valid_percentage(&landmark.fallback_placement.top)
        {
            return Err(format!("{location:?} has an invalid landmark"));
        }
    }
    Ok(())
}

fn validate_world(world: &TopiaWorldConfig) -> Result<(), String> {
    if !matches!(world.schema_version, 1 | 2)
        || !valid_text(&world.id, 80)
        || !valid_text(&world.owner_id, 80)
        || world.revision == 0
        || !matches!(world.source.as_str(), "mock" | "cloud")
        || !valid_text(&world.profile.home_name, 48)
        || !valid_text(&world.profile.archetype, 100)
        || world
            .profile
            .accent_colors
            .iter()
            .any(|color| *color > 0x00ff_ffff)
    {
        return Err("invalid Topia world metadata".into());
    }
    if !valid_text(&world.sky.theme, 48)
        || !valid_text(&world.sky.celestial_shape, 48)
        || world.sky.motifs.len() > 8
        || world.sky.motifs.iter().any(|motif| !valid_text(motif, 48))
        || !(0.0..=1.0).contains(&world.sky.decoration_density)
        || !(0.0..=1.0).contains(&world.sky.drift)
        || world.sky.magic < 0.0
        || world.sky.magic > 1.0
        || [
            world.sky.top,
            world.sky.mid,
            world.sky.low,
            world.sky.aurora,
            world.sky.celestial,
            world.sky.stars,
            world.sky.fog,
        ]
        .iter()
        .any(|color| *color > 0x00ff_ffff)
    {
        return Err("invalid Topia sky configuration".into());
    }
    if world.render_style.seed == 0
        || !(0.0..=1.0).contains(&world.render_style.roughness)
        || !(0.0..=1.0).contains(&world.render_style.metalness)
        || !(0.65..=1.5).contains(&world.render_style.saturation)
        || !(0.65..=1.5).contains(&world.render_style.contrast)
        || !(0.0..=1.0).contains(&world.render_style.texture_strength)
    {
        return Err("invalid Topia render style".into());
    }
    validate_scene(&world.scenes.exterior, TopiaLocation::Exterior)?;
    validate_scene(&world.scenes.interior, TopiaLocation::Interior)?;
    validate_scene(&world.scenes.garden, TopiaLocation::Garden)?;
    if !world
        .scenes
        .exterior
        .objects
        .iter()
        .any(|object| object.prefab == TopiaPrefab::FloatingIsland)
        || !world.scenes.exterior.objects.iter().any(|object| {
            object.prefab == TopiaPrefab::Door
                && object.anchor_id.as_deref() == Some("portal-interior")
        })
        || !world
            .scenes
            .exterior
            .objects
            .iter()
            .any(|object| object.anchor_id.as_deref() == Some("portal-garden"))
        || world
            .scenes
            .interior
            .objects
            .iter()
            .filter(|object| object.prefab == TopiaPrefab::RoomShell)
            .count()
            != 1
        || !world
            .scenes
            .garden
            .objects
            .iter()
            .any(|object| object.prefab == TopiaPrefab::FloatingIsland)
    {
        return Err(
            "Topia must contain a floating home, clickable door, crop island and one room".into(),
        );
    }
    for location in [
        TopiaLocation::Exterior,
        TopiaLocation::Interior,
        TopiaLocation::Garden,
    ] {
        let scene = match location {
            TopiaLocation::Exterior => &world.scenes.exterior,
            TopiaLocation::Interior => &world.scenes.interior,
            TopiaLocation::Garden => &world.scenes.garden,
        };
        for souvenir in scene
            .objects
            .iter()
            .filter(|object| object.layer == TopiaObjectLayer::Souvenir)
        {
            let anchor = souvenir
                .anchor_id
                .as_deref()
                .ok_or_else(|| "souvenir has no anchor".to_string())?;
            if souvenir.animation.as_deref() != Some("sparkle")
                || !scene
                    .landmarks
                    .iter()
                    .any(|landmark| landmark.anchor_id == anchor)
            {
                return Err("每件纪念品都必须有闪光效果和可点击地标".into());
            }
        }
    }
    Ok(())
}

fn extract_json(value: &str) -> Result<Value, String> {
    let trimmed = value.trim();
    let without_opening = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim();
    let without_fence = without_opening
        .strip_suffix("```")
        .unwrap_or(without_opening)
        .trim();
    Ok(match serde_json::from_str::<Value>(without_fence) {
        Ok(value) => value,
        Err(_) => {
            let start = without_fence
                .find('{')
                .ok_or_else(|| "cloud did not return Topia JSON".to_string())?;
            let end = without_fence
                .rfind('}')
                .filter(|end| *end > start)
                .ok_or_else(|| "cloud did not return complete Topia JSON".to_string())?;
            serde_json::from_str(&without_fence[start..=end]).map_err(|error| error.to_string())?
        }
    })
}

fn parse_world_unchecked(value: &str) -> Result<TopiaWorldConfig, String> {
    let json = extract_json(value)?;
    let world: TopiaWorldConfig =
        serde_json::from_value(json).map_err(|error| error.to_string())?;
    Ok(world)
}

fn parse_world(value: &str) -> Result<TopiaWorldConfig, String> {
    let world = parse_world_unchecked(value)?;
    validate_world(&world)?;
    Ok(world)
}

fn parse_review(value: &str) -> Result<TopiaGenerationReview, String> {
    serde_json::from_value(extract_json(value)?).map_err(|error| error.to_string())
}

fn mock_world() -> Result<TopiaWorldConfig, String> {
    let mut world = parse_world(MOCK_WORLD)?;
    migrate_world(&mut world);
    Ok(world)
}

fn migrate_world(world: &mut TopiaWorldConfig) {
    world.schema_version = 2;
    for location in [
        TopiaLocation::Exterior,
        TopiaLocation::Interior,
        TopiaLocation::Garden,
    ] {
        let scene = scene_mut(world, location);
        let souvenir_anchors: HashSet<_> = scene
            .landmarks
            .iter()
            .filter(|landmark| !landmark.memory_ids.is_empty())
            .map(|landmark| landmark.anchor_id.as_str())
            .collect();
        for object in &mut scene.objects {
            if object.prefab == TopiaPrefab::CropPlot {
                object.layer = TopiaObjectLayer::Crop;
            } else if object
                .anchor_id
                .as_deref()
                .is_some_and(|anchor| souvenir_anchors.contains(anchor))
            {
                object.layer = TopiaObjectLayer::Souvenir;
                object.animation = Some("sparkle".into());
                if let Some(anchor) = object.anchor_id.as_deref() {
                    if let Some(landmark) =
                        scene.landmarks.iter().find(|item| item.anchor_id == anchor)
                    {
                        object.memory_ids = landmark.memory_ids.clone();
                    }
                }
            } else if object.layer == TopiaObjectLayer::Souvenir && object.memory_ids.is_empty() {
                object.layer = TopiaObjectLayer::Decoration;
            } else if matches!(
                object.prefab,
                TopiaPrefab::Plant
                    | TopiaPrefab::Crystal
                    | TopiaPrefab::WindChimes
                    | TopiaPrefab::Lantern
                    | TopiaPrefab::Rug
                    | TopiaPrefab::Cloud
                    | TopiaPrefab::WateringOrb
            ) {
                object.layer = TopiaObjectLayer::Decoration;
            }
        }
    }
}

fn remove_souvenirs(world: &mut TopiaWorldConfig) {
    for location in [
        TopiaLocation::Exterior,
        TopiaLocation::Interior,
        TopiaLocation::Garden,
    ] {
        let scene = scene_mut(world, location);
        let anchors: HashSet<String> = scene
            .objects
            .iter()
            .filter(|object| object.layer == TopiaObjectLayer::Souvenir)
            .filter_map(|object| object.anchor_id.clone())
            .collect();
        scene
            .objects
            .retain(|object| object.layer != TopiaObjectLayer::Souvenir);
        scene
            .landmarks
            .retain(|landmark| !anchors.contains(&landmark.anchor_id));
    }
}

fn migrate_assets(assets: &mut TopiaAssetLayer) {
    for objects in [
        &mut assets.objects.exterior,
        &mut assets.objects.interior,
        &mut assets.objects.garden,
    ] {
        for object in objects {
            if object.layer == TopiaObjectLayer::Souvenir && object.memory_ids.is_empty() {
                object.layer = TopiaObjectLayer::Decoration;
            } else if object.layer == TopiaObjectLayer::Souvenir {
                object.animation = Some("sparkle".into());
            }
        }
    }
}

fn world_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(WORLD_FILE))
}

fn legacy_world_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(directory.join(LEGACY_WORLD_FILE))
}

fn split_assets(world: &mut TopiaWorldConfig) -> TopiaAssetLayer {
    let mut assets = TopiaAssetLayer::default();
    for location in [
        TopiaLocation::Exterior,
        TopiaLocation::Interior,
        TopiaLocation::Garden,
    ] {
        let scene = scene_mut(world, location);
        let portable_anchors: HashSet<String> = scene
            .objects
            .iter()
            .filter(|object| object.layer != TopiaObjectLayer::Structure)
            .filter_map(|object| object.anchor_id.clone())
            .collect();
        let mut objects = Vec::new();
        scene.objects.retain(|object| {
            if object.layer == TopiaObjectLayer::Structure {
                true
            } else {
                objects.push(object.clone());
                false
            }
        });
        let mut landmarks = Vec::new();
        scene.landmarks.retain(|landmark| {
            if portable_anchors.contains(&landmark.anchor_id) {
                landmarks.push(landmark.clone());
                false
            } else {
                true
            }
        });
        let object_landmarks: HashMap<_, _> = landmarks
            .iter()
            .map(|landmark| (landmark.anchor_id.as_str(), landmark))
            .collect();
        for object in &objects {
            let landmark = object
                .anchor_id
                .as_deref()
                .and_then(|anchor| object_landmarks.get(anchor));
            assets.memories.push(TopiaAssetMemory {
                id: format!("topia-asset-{}", object.id),
                object_id: object.id.clone(),
                location,
                kind: match object.layer {
                    TopiaObjectLayer::Crop => "crop",
                    TopiaObjectLayer::Souvenir => "souvenir",
                    TopiaObjectLayer::Decoration => "decoration",
                    TopiaObjectLayer::Structure => "structure",
                }
                .into(),
                label: landmark
                    .map(|item| item.label.clone())
                    .unwrap_or_else(|| object.id.clone()),
                created_at: world.generated_at.clone(),
                source_memory_ids: object.memory_ids.clone(),
                source_task_ids: object.task_id.clone().into_iter().collect(),
            });
        }
        match location {
            TopiaLocation::Exterior => {
                assets.objects.exterior = objects;
                assets.landmarks.exterior = landmarks;
            }
            TopiaLocation::Interior => {
                assets.objects.interior = objects;
                assets.landmarks.interior = landmarks;
            }
            TopiaLocation::Garden => {
                assets.objects.garden = objects;
                assets.landmarks.garden = landmarks;
            }
        }
    }
    assets
}

fn merge_assets(world: &mut TopiaWorldConfig, assets: &TopiaAssetLayer) {
    for location in [
        TopiaLocation::Exterior,
        TopiaLocation::Interior,
        TopiaLocation::Garden,
    ] {
        let scene = scene_mut(world, location);
        let (objects, landmarks) = match location {
            TopiaLocation::Exterior => (&assets.objects.exterior, &assets.landmarks.exterior),
            TopiaLocation::Interior => (&assets.objects.interior, &assets.landmarks.interior),
            TopiaLocation::Garden => (&assets.objects.garden, &assets.landmarks.garden),
        };
        let ids: HashSet<String> = scene.objects.iter().map(|item| item.id.clone()).collect();
        scene.objects.extend(
            objects
                .iter()
                .filter(|item| !ids.contains(item.id.as_str()))
                .cloned(),
        );
        let landmark_ids: HashSet<String> =
            scene.landmarks.iter().map(|item| item.id.clone()).collect();
        scene.landmarks.extend(
            landmarks
                .iter()
                .filter(|item| !landmark_ids.contains(item.id.as_str()))
                .cloned(),
        );
    }
}

fn extend_portable_assets(target: &mut TopiaAssetLayer, inherited: &TopiaAssetLayer) {
    fn merge_objects(target: &mut Vec<TopiaObjectConfig>, inherited: &[TopiaObjectConfig]) {
        let represented_memories: HashSet<String> = target
            .iter()
            .flat_map(|object| object.memory_ids.iter().cloned())
            .collect();
        let ids: HashSet<String> = target.iter().map(|object| object.id.clone()).collect();
        target.extend(
            inherited
                .iter()
                .filter(|object| {
                    !ids.contains(&object.id)
                        && (object.memory_ids.is_empty()
                            || object
                                .memory_ids
                                .iter()
                                .any(|id| !represented_memories.contains(id)))
                })
                .cloned(),
        );
    }
    fn merge_landmarks(target: &mut Vec<TopiaLandmark>, inherited: &[TopiaLandmark]) {
        let memories: HashSet<String> = target
            .iter()
            .flat_map(|landmark| landmark.memory_ids.iter().cloned())
            .collect();
        let ids: HashSet<String> = target.iter().map(|item| item.id.clone()).collect();
        target.extend(
            inherited
                .iter()
                .filter(|landmark| {
                    !ids.contains(&landmark.id)
                        && (landmark.memory_ids.is_empty()
                            || landmark.memory_ids.iter().any(|id| !memories.contains(id)))
                })
                .cloned(),
        );
    }
    merge_objects(&mut target.objects.exterior, &inherited.objects.exterior);
    merge_objects(&mut target.objects.interior, &inherited.objects.interior);
    merge_objects(&mut target.objects.garden, &inherited.objects.garden);
    merge_landmarks(
        &mut target.landmarks.exterior,
        &inherited.landmarks.exterior,
    );
    merge_landmarks(
        &mut target.landmarks.interior,
        &inherited.landmarks.interior,
    );
    merge_landmarks(&mut target.landmarks.garden, &inherited.landmarks.garden);
    let asset_ids: HashSet<String> = target
        .memories
        .iter()
        .map(|memory| memory.id.clone())
        .collect();
    target.memories.extend(
        inherited
            .memories
            .iter()
            .filter(|memory| !asset_ids.contains(&memory.id))
            .cloned(),
    );
}

fn studio_payload(state: &TopiaStudioState) -> TopiaStudioPayload {
    TopiaStudioPayload {
        active_world_id: state.active_world_id.clone(),
        worlds: state
            .worlds
            .iter()
            .map(|world| TopiaWorldSummary {
                id: world.id.clone(),
                home_name: world.profile.home_name.clone(),
                archetype: world.profile.archetype.clone(),
                generated_at: world.generated_at.clone(),
                active: world.id == state.active_world_id,
                source: world.source.clone(),
                thumbnail: state.thumbnails.get(&world.id).cloned(),
            })
            .collect(),
        assets: state.assets.clone(),
        last_profile: state.last_profile.clone(),
        needs_onboarding: state.onboarding_completed == Some(false),
    }
}

fn initial_studio() -> Result<TopiaStudioState, String> {
    let mut world = mock_world()?;
    remove_souvenirs(&mut world);
    let assets = split_assets(&mut world);
    Ok(TopiaStudioState {
        schema_version: 2,
        active_world_id: world.id.clone(),
        worlds: vec![world],
        assets,
        last_profile: None,
        last_maintained_at: None,
        last_context_digest: None,
        onboarding_completed: Some(false),
        thumbnails: HashMap::new(),
    })
}

fn ensure_default_world(state: &mut TopiaStudioState) -> Result<(), String> {
    if state
        .worlds
        .first()
        .is_some_and(|world| world.source == "mock")
    {
        return Ok(());
    }
    let mut default_world = mock_world()?;
    remove_souvenirs(&mut default_world);
    let default_assets = split_assets(&mut default_world);
    extend_portable_assets(&mut state.assets, &default_assets);
    if !state
        .worlds
        .iter()
        .any(|world| world.id == default_world.id)
    {
        state.worlds.insert(0, default_world);
    } else if let Some(index) = state
        .worlds
        .iter()
        .position(|world| world.id == default_world.id)
    {
        let default_world = state.worlds.remove(index);
        state.worlds.insert(0, default_world);
    }
    Ok(())
}

fn load_studio(app: &tauri::AppHandle) -> Result<TopiaStudioState, String> {
    let path = world_path(app)?;
    if path.exists() {
        let value = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
        if let Ok(mut state) = serde_json::from_str::<TopiaStudioState>(&value) {
            let legacy_incomplete_onboarding = state.onboarding_completed == Some(false);
            for world in &mut state.worlds {
                migrate_world(world);
            }
            migrate_assets(&mut state.assets);
            ensure_default_world(&mut state)?;
            if legacy_incomplete_onboarding {
                state.onboarding_completed = Some(true);
                persist_studio(app, &state)?;
            }
            if !state.worlds.is_empty()
                && state
                    .worlds
                    .iter()
                    .any(|world| world.id == state.active_world_id)
            {
                return Ok(state);
            }
        }
    }
    let legacy = legacy_world_path(app)?;
    if legacy.exists() {
        let value = std::fs::read_to_string(legacy).map_err(|error| error.to_string())?;
        if let Ok(mut world) = parse_world(&value) {
            migrate_world(&mut world);
            let assets = split_assets(&mut world);
            let mut state = TopiaStudioState {
                schema_version: 2,
                active_world_id: world.id.clone(),
                worlds: vec![world],
                assets,
                last_profile: None,
                last_maintained_at: None,
                last_context_digest: None,
                onboarding_completed: Some(true),
                thumbnails: HashMap::new(),
            };
            ensure_default_world(&mut state)?;
            return Ok(state);
        }
    }
    initial_studio()
}

fn persist_studio(app: &tauri::AppHandle, state: &TopiaStudioState) -> Result<(), String> {
    if state.worlds.is_empty()
        || !state
            .worlds
            .iter()
            .any(|world| world.id == state.active_world_id)
    {
        return Err("Topia studio has no active world".into());
    }
    for structure in &state.worlds {
        let mut composed = structure.clone();
        merge_assets(&mut composed, &state.assets);
        validate_world(&composed)?;
    }
    let value = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
    std::fs::write(world_path(app)?, value).map_err(|error| error.to_string())
}

fn context_digest(context: &TopiaRuntimeContext) -> Result<u64, String> {
    let value = serde_json::to_string(context).map_err(|error| error.to_string())?;
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    Ok(hasher.finish())
}

fn choose_render_style(input: &TopiaGenerationInput) -> Result<TopiaRenderStyleConfig, String> {
    let profile = serde_json::to_string(&input.profile).map_err(|error| error.to_string())?;
    let mut hasher = DefaultHasher::new();
    profile.hash(&mut hasher);
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos()
        .hash(&mut hasher);
    let hash = hasher.finish();
    let preference = input.profile.style_preferences.first().map(String::as_str);
    let pool: &[TopiaRenderStyleKind] = match preference {
        Some("柔软温暖") => &[
            TopiaRenderStyleKind::PlushToy,
            TopiaRenderStyleKind::StorybookInk,
            TopiaRenderStyleKind::PainterlyOil,
        ],
        Some("手工肌理") => &[
            TopiaRenderStyleKind::PaperCraft,
            TopiaRenderStyleKind::StorybookInk,
            TopiaRenderStyleKind::PlushToy,
        ],
        Some("绘画笔触") => &[
            TopiaRenderStyleKind::PainterlyOil,
            TopiaRenderStyleKind::StorybookInk,
            TopiaRenderStyleKind::PaperCraft,
        ],
        Some("晶莹光泽") => &[
            TopiaRenderStyleKind::GlazedCeramic,
            TopiaRenderStyleKind::CrystalDiorama,
            TopiaRenderStyleKind::PainterlyOil,
        ],
        _ => &[
            TopiaRenderStyleKind::PainterlyOil,
            TopiaRenderStyleKind::PlushToy,
            TopiaRenderStyleKind::PaperCraft,
            TopiaRenderStyleKind::GlazedCeramic,
            TopiaRenderStyleKind::StorybookInk,
            TopiaRenderStyleKind::CrystalDiorama,
        ],
    };
    let kind = pool[(hash as usize) % pool.len()];
    let jitter = |shift: u32| (((hash >> shift) & 0xff) as f64 / 255.0 - 0.5) * 0.08;
    let (roughness, metalness, saturation, contrast, texture_strength) = match kind {
        TopiaRenderStyleKind::PainterlyOil => (0.78, 0.02, 1.08, 1.08, 0.78),
        TopiaRenderStyleKind::PlushToy => (0.98, 0.0, 0.94, 0.92, 0.68),
        TopiaRenderStyleKind::PaperCraft => (0.92, 0.0, 0.9, 1.12, 0.72),
        TopiaRenderStyleKind::GlazedCeramic => (0.24, 0.06, 1.04, 1.08, 0.25),
        TopiaRenderStyleKind::StorybookInk => (0.86, 0.01, 0.96, 1.14, 0.48),
        TopiaRenderStyleKind::CrystalDiorama => (0.18, 0.18, 1.12, 1.04, 0.2),
    };
    Ok(TopiaRenderStyleConfig {
        kind,
        seed: ((hash as u32) | 1),
        roughness: (roughness + jitter(8)).clamp(0.0, 1.0),
        metalness: (metalness + jitter(16)).clamp(0.0, 1.0),
        saturation: (saturation + jitter(24)).clamp(0.65, 1.5),
        contrast: (contrast + jitter(32)).clamp(0.65, 1.5),
        texture_strength: (texture_strength + jitter(40)).clamp(0.0, 1.0),
    })
}

fn iteration_input(state: &TopiaStudioState, context: TopiaRuntimeContext) -> TopiaGenerationInput {
    TopiaGenerationInput {
        profile: state.last_profile.clone().unwrap_or(TopiaUserProfileInput {
            display_name: None,
            summary: "延续当前 Topia，并把最近的任务、关系和记忆变成新的收藏".into(),
            traits: vec![],
            experiences: vec![],
            preferences: vec![],
            imagery: vec![],
            sensations: vec![],
            style_preferences: vec![],
        }),
        context,
    }
}

#[cfg(mobile)]
fn maintenance_due(state: &TopiaStudioState, digest: u64) -> bool {
    state.last_context_digest != Some(digest)
        && state
            .last_maintained_at
            .as_deref()
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
            .is_some_and(|value| {
                Utc::now()
                    .signed_duration_since(value.with_timezone(&Utc))
                    .num_hours()
                    >= 24
            })
}

fn filter_relations(world: &mut TopiaWorldConfig, context: &TopiaRuntimeContext) {
    let quest_ids: HashSet<_> = context
        .quests
        .iter()
        .map(|quest| quest.id.as_str())
        .collect();
    let person_ids: HashSet<_> = context
        .people
        .iter()
        .map(|person| person.id.as_str())
        .collect();
    let memory_ids: HashSet<_> = context
        .memories
        .iter()
        .map(|memory| memory.id.as_str())
        .collect();
    for location in [
        TopiaLocation::Exterior,
        TopiaLocation::Interior,
        TopiaLocation::Garden,
    ] {
        let scene = scene_mut(world, location);
        for object in &mut scene.objects {
            if object
                .task_id
                .as_deref()
                .is_some_and(|id| !quest_ids.contains(id))
            {
                object.task_id = None;
            }
        }
        for landmark in &mut scene.landmarks {
            landmark
                .task_ids
                .retain(|id| quest_ids.contains(id.as_str()));
            landmark
                .person_ids
                .retain(|id| person_ids.contains(id.as_str()));
            landmark
                .memory_ids
                .retain(|id| memory_ids.contains(id.as_str()));
        }
    }
}

fn payload(
    state: &TopiaStudioState,
    context: &TopiaRuntimeContext,
) -> Result<TopiaWorldPayload, String> {
    let mut world = state
        .worlds
        .iter()
        .find(|world| world.id == state.active_world_id)
        .cloned()
        .ok_or_else(|| "active Topia does not exist".to_string())?;
    merge_assets(&mut world, &state.assets);
    filter_relations(&mut world, context);
    let quests: HashMap<_, _> = context
        .quests
        .iter()
        .map(|quest| (quest.id.as_str(), quest))
        .collect();
    let crop_names = ["sunflower", "tomato", "lavender", "pumpkin", "herb"];
    let crops = world
        .scenes
        .garden
        .objects
        .iter()
        .filter_map(|object| {
            if object.prefab != TopiaPrefab::CropPlot {
                return None;
            }
            let quest = quests.get(object.task_id.as_deref()?)?;
            let crop = object
                .params
                .get("crop")
                .and_then(Value::as_str)
                .filter(|value| crop_names.contains(value))
                .unwrap_or("herb");
            Some(TopiaSceneCrop {
                id: quest.id.clone(),
                title: quest.title.clone(),
                progress: quest.progress,
                crop: crop.into(),
                person_id: quest.person_id.clone(),
            })
        })
        .collect();
    for landmark in &mut world.scenes.garden.landmarks {
        let Some(quest) = landmark
            .task_ids
            .iter()
            .find_map(|id| quests.get(id.as_str()))
        else {
            continue;
        };
        landmark.label = quest.title.clone();
        landmark.eyebrow = format!("任务作物 · 生长 {}%", quest.progress);
        landmark.description = if quest.progress >= 100 {
            "任务已经完成，作物成熟并结出了可以收获的果实。".into()
        } else {
            format!(
                "这株作物会随着「{}」的推进继续生长。下一次任务进展会直接反映在枝叶与果实上。",
                quest.title
            )
        };
        for memory in &context.memories {
            if memory.task_ids.contains(&quest.id) && !landmark.memory_ids.contains(&memory.id) {
                landmark.memory_ids.push(memory.id.clone());
            }
        }
    }
    Ok(TopiaWorldPayload {
        world,
        crops,
        studio: studio_payload(state),
    })
}

fn emit_progress(app: &tauri::AppHandle, mode: &str, stage: &str, progress: u8, message: &str) {
    let _ = app.emit(
        "topia-generation-progress",
        TopiaGenerationProgress {
            mode: mode.into(),
            stage: stage.into(),
            progress,
            message: message.into(),
        },
    );
}

fn finalize_generated_world(
    mut world: TopiaWorldConfig,
    input: &TopiaGenerationInput,
    provider: String,
    model: String,
) -> Result<(TopiaWorldConfig, TopiaAssetLayer), String> {
    migrate_world(&mut world);
    filter_relations(&mut world, &input.context);
    world.source = "cloud".into();
    #[cfg(mobile)]
    {
        world.generated_at = Utc::now().to_rfc3339();
    }
    world.generation = Some(TopiaGenerationMetadata {
        provider,
        model,
        prompt_version: prompt::PROMPT_VERSION.into(),
    });
    validate_world(&world)?;
    let assets = split_assets(&mut world);
    Ok((world, assets))
}

#[tauri::command]
pub fn load_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    let state = load_studio(&app)?;
    payload(&state, &context)
}

#[tauri::command]
pub fn save_topia_world(
    mut world: TopiaWorldConfig,
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    migrate_world(&mut world);
    filter_relations(&mut world, &context);
    validate_world(&world)?;
    let mut state = load_studio(&app)?;
    let assets = split_assets(&mut world);
    extend_portable_assets(&mut state.assets, &assets);
    state.active_world_id = world.id.clone();
    if let Some(existing) = state.worlds.iter_mut().find(|item| item.id == world.id) {
        *existing = world;
    } else {
        state.worlds.push(world);
    }
    persist_studio(&app, &state)?;
    payload(&state, &context)
}

#[tauri::command]
pub fn reset_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    let path = world_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    let state = initial_studio()?;
    persist_studio(&app, &state)?;
    payload(&state, &context)
}

pub fn delete_topia_user_data(app: &tauri::AppHandle) -> Result<(), String> {
    for path in [world_path(app)?, legacy_world_path(app)?] {
        if path.exists() {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn switch_topia_world(
    world_id: String,
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    let mut state = load_studio(&app)?;
    if !state.worlds.iter().any(|world| world.id == world_id) {
        return Err("Topia 不存在".into());
    }
    state.active_world_id = world_id;
    persist_studio(&app, &state)?;
    payload(&state, &context)
}

#[tauri::command]
pub fn complete_topia_onboarding(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    let mut state = load_studio(&app)?;
    state.onboarding_completed = Some(true);
    persist_studio(&app, &state)?;
    payload(&state, &context)
}

#[tauri::command]
pub fn save_topia_thumbnail(
    world_id: String,
    thumbnail: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if thumbnail.len() > 240_000
        || !thumbnail.starts_with("data:image/jpeg;base64,")
        || !thumbnail
            .bytes()
            .skip("data:image/jpeg;base64,".len())
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='))
    {
        return Err("Topia thumbnail must be a compact JPEG data URL".into());
    }
    let mut state = load_studio(&app)?;
    if !state.worlds.iter().any(|world| world.id == world_id) {
        return Err("Topia 不存在".into());
    }
    state.thumbnails.insert(world_id, thumbnail);
    persist_studio(&app, &state)
}

#[tauri::command]
pub fn generate_topia_world(
    input: TopiaGenerationInput,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    emit_progress(&app, "create", "concept", 8, "正在读取你的意象");
    let render_style = choose_render_style(&input)?;
    let concept_prompt = prompt::build_concept(&input, &render_style)?;
    #[cfg(mobile)]
    let concept = app
        .state::<crate::mobile_cloud::RealiaCloud<tauri::Wry>>()
        .complete(crate::mobile_cloud::CompleteRequest {
            prompt: &concept_prompt,
            system: Some(prompt::CONCEPT_SYSTEM_PROMPT),
            json: true,
        })?;
    #[cfg(not(mobile))]
    {
        let _ = (input, app, concept_prompt);
        return Err("Topia cloud generation is only available in the Android app".into());
    }
    #[cfg(mobile)]
    {
        emit_progress(&app, "create", "world", 38, "正在塑造浮空居所与天空");
        let mut state = load_studio(&app)?;
        let world_prompt =
            prompt::build_world(&input, &concept.text, &state.assets, &render_style)?;
        let response = app
            .state::<crate::mobile_cloud::RealiaCloud<tauri::Wry>>()
            .complete(crate::mobile_cloud::CompleteRequest {
                prompt: &world_prompt,
                system: Some(prompt::WORLD_SYSTEM_PROMPT),
                json: true,
            })?;
        emit_progress(&app, "create", "review", 70, "正在审视意象、结构与个人资产");
        let mut candidate = parse_world_unchecked(&response.text)?;
        migrate_world(&mut candidate);
        candidate.render_style = render_style;
        filter_relations(&mut candidate, &input.context);
        let validation_error = validate_world(&candidate).err();
        let review_prompt = prompt::build_review(
            &input,
            &concept.text,
            &candidate,
            &state.assets,
            validation_error.as_deref(),
        )?;
        let review_response = app
            .state::<crate::mobile_cloud::RealiaCloud<tauri::Wry>>()
            .complete(crate::mobile_cloud::CompleteRequest {
                prompt: &review_prompt,
                system: Some(prompt::REVIEW_SYSTEM_PROMPT),
                json: true,
            })?;
        let review = parse_review(&review_response.text)?;
        let (parsed, provider, model) = if review.approved && validation_error.is_none() {
            (candidate, response.provider, response.model)
        } else {
            emit_progress(&app, "create", "revision", 84, "正在根据审稿结果修订世界");
            let mut issues = review.issues;
            if let Some(error) = validation_error {
                issues.push(format!("Rust schema validation: {error}"));
            }
            let revision_prompt = prompt::build_revision(
                &input,
                &candidate,
                &state.assets,
                &issues,
                &review.repair_instructions,
            )?;
            let revision = app
                .state::<crate::mobile_cloud::RealiaCloud<tauri::Wry>>()
                .complete(crate::mobile_cloud::CompleteRequest {
                    prompt: &revision_prompt,
                    system: Some(prompt::WORLD_SYSTEM_PROMPT),
                    json: true,
                })?;
            let mut repaired = parse_world_unchecked(&revision.text)?;
            migrate_world(&mut repaired);
            repaired.render_style = candidate.render_style;
            filter_relations(&mut repaired, &input.context);
            validate_world(&repaired)?;
            (repaired, revision.provider, revision.model)
        };
        emit_progress(&app, "create", "assets", 92, "正在安置作物、装饰与纪念品");
        let (mut world, mut generated_assets) =
            finalize_generated_world(parsed, &input, provider, model)?;
        world.id = format!("topia-{}", Utc::now().timestamp_millis());
        extend_portable_assets(&mut generated_assets, &state.assets);
        state.assets = generated_assets;
        state.last_profile = Some(input.profile.clone());
        state.onboarding_completed = Some(true);
        state.active_world_id = world.id.clone();
        if let Some(existing) = state.worlds.iter_mut().find(|item| item.id == world.id) {
            *existing = world;
        } else {
            state.worlds.push(world);
        }
        persist_studio(&app, &state)?;
        emit_progress(&app, "create", "complete", 100, "新的 Topia 已经抵达");
        payload(&state, &input.context)
    }
}

#[tauri::command]
pub fn iterate_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    let mut state = load_studio(&app)?;
    let input = iteration_input(&state, context);
    let mut current = state
        .worlds
        .iter()
        .find(|world| world.id == state.active_world_id)
        .cloned()
        .ok_or_else(|| "active Topia does not exist".to_string())?;
    merge_assets(&mut current, &state.assets);
    emit_progress(&app, "iterate", "memory", 12, "正在回看最近的旅程");
    let user_prompt = prompt::build_iteration(&current, &state.assets, &input)?;
    #[cfg(mobile)]
    let response = app
        .state::<crate::mobile_cloud::RealiaCloud<tauri::Wry>>()
        .complete(crate::mobile_cloud::CompleteRequest {
            prompt: &user_prompt,
            system: Some(prompt::WORLD_SYSTEM_PROMPT),
            json: true,
        })?;
    #[cfg(not(mobile))]
    {
        let _ = (input, app, user_prompt);
        return Err("Topia cloud generation is only available in the Android app".into());
    }
    #[cfg(mobile)]
    {
        emit_progress(&app, "iterate", "assets", 72, "正在让新故事长成纪念品");
        let parsed = parse_world(&response.text)?;
        let (mut world, mut assets) =
            finalize_generated_world(parsed, &input, response.provider, response.model)?;
        world.id = state.active_world_id.clone();
        extend_portable_assets(&mut assets, &state.assets);
        state.assets = assets;
        state.last_context_digest = Some(context_digest(&input.context)?);
        state.last_maintained_at = Some(Utc::now().to_rfc3339());
        if let Some(existing) = state
            .worlds
            .iter_mut()
            .find(|item| item.id == state.active_world_id)
        {
            *existing = world;
        }
        persist_studio(&app, &state)?;
        emit_progress(&app, "iterate", "complete", 100, "Topia 已记录新的变化");
        payload(&state, &input.context)
    }
}

#[tauri::command]
pub fn maintain_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<Option<TopiaWorldPayload>, String> {
    let mut state = load_studio(&app)?;
    let digest = context_digest(&context)?;
    #[cfg(mobile)]
    {
        if state.last_maintained_at.is_none() {
            state.last_maintained_at = Some(Utc::now().to_rfc3339());
            state.last_context_digest = Some(digest);
            persist_studio(&app, &state)?;
            return Ok(None);
        }
        if !maintenance_due(&state, digest) {
            return Ok(None);
        }
        // Scheduling policy remains in Rust; the same iteration command owns generation.
        drop(state);
        return iterate_topia_world(context, app).map(Some);
    }
    #[cfg(not(mobile))]
    {
        let _ = (context, app, digest, state);
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_mock_is_a_complete_valid_world() {
        let world = mock_world().expect("mock world should parse");
        assert_eq!(world.schema_version, 2);
        assert!(world.scenes.exterior.objects.len() >= 8);
        assert!(world.scenes.interior.objects.len() >= 8);
        assert!(world.scenes.garden.objects.len() >= 8);
    }

    #[test]
    fn prompt_describes_all_personal_world_views() {
        let input = TopiaGenerationInput {
            profile: TopiaUserProfileInput {
                display_name: Some("测试用户".into()),
                summary: "喜欢植物与星空".into(),
                traits: vec!["好奇".into()],
                experiences: vec!["旧温室".into()],
                preferences: vec!["温暖".into()],
                imagery: vec!["风经过时展开的纸船".into()],
                sensations: vec!["被薄雾轻轻包住".into()],
                style_preferences: vec!["手工肌理".into()],
            },
            context: TopiaRuntimeContext::default(),
        };
        let style = TopiaRenderStyleConfig::default();
        let concept =
            prompt::build_concept(&input, &style).expect("concept prompt should serialize");
        let value = prompt::build_world(&input, &concept, &TopiaAssetLayer::default(), &style)
            .expect("world prompt should serialize");
        assert!(value.contains("floating home"));
        assert!(value.contains("room-shell"));
        assert!(value.contains("crop-plots"));
        assert!(value.contains("测试用户"));
        assert!(value.contains("Return JSON only"));
        assert!(value.contains("NON-LITERAL IMAGERY RULE"));
        assert!(concept.contains("paper boat must not cause a paper boat object"));
        assert!(prompt::WORLD_SYSTEM_PROMPT.contains("sad adds rain"));
    }

    #[test]
    fn rejects_landmarks_without_scene_anchors() {
        let mut world = mock_world().expect("mock world should parse");
        world.scenes.exterior.landmarks[0].anchor_id = "missing-anchor".into();
        assert!(validate_world(&world).is_err());
    }

    #[test]
    fn runtime_payload_hydrates_task_crops() {
        let world = mock_world().expect("mock world should parse");
        let context = TopiaRuntimeContext {
            quests: vec![TopiaQuestContext {
                id: "app".into(),
                title: "完成动态世界".into(),
                progress: 68,
                person_id: None,
                priority: None,
                category: None,
                status: None,
                reward: None,
            }],
            ..TopiaRuntimeContext::default()
        };
        let mut structure = world;
        let assets = split_assets(&mut structure);
        let state = TopiaStudioState {
            schema_version: 2,
            active_world_id: structure.id.clone(),
            worlds: vec![structure],
            assets,
            last_profile: None,
            last_maintained_at: None,
            last_context_digest: None,
            onboarding_completed: Some(true),
            thumbnails: HashMap::new(),
        };
        let resolved = payload(&state, &context).expect("payload should resolve");
        assert_eq!(resolved.crops.len(), 1);
        assert_eq!(resolved.crops[0].progress, 68);
        assert!(resolved
            .world
            .scenes
            .garden
            .landmarks
            .iter()
            .any(|landmark| {
                landmark.label == "完成动态世界" && landmark.eyebrow.contains("68%")
            }));
    }

    #[test]
    fn relation_filter_removes_model_invented_ids() {
        let mut world = mock_world().expect("mock world should parse");
        let landmark = &mut world.scenes.exterior.landmarks[0];
        landmark.task_ids = vec!["known-task".into(), "invented-task".into()];
        landmark.person_ids = vec!["known-person".into(), "invented-person".into()];
        landmark.memory_ids = vec!["known-memory".into(), "invented-memory".into()];
        let context = TopiaRuntimeContext {
            quests: vec![TopiaQuestContext {
                id: "known-task".into(),
                title: "真实任务".into(),
                progress: 10,
                person_id: None,
                priority: None,
                category: None,
                status: None,
                reward: None,
            }],
            people: vec![TopiaPersonContext {
                id: "known-person".into(),
                name: "真实人物".into(),
                role: "朋友".into(),
                affinity: 50,
            }],
            memories: vec![TopiaMemoryContext {
                id: "known-memory".into(),
                title: "真实记忆".into(),
                meta: "测试".into(),
                summary: None,
                person_ids: vec![],
                task_ids: vec![],
                mood: None,
                intensity: None,
                kind: None,
                evidence: None,
                confidence: None,
                observed_at: None,
            }],
        };
        filter_relations(&mut world, &context);
        let landmark = &world.scenes.exterior.landmarks[0];
        assert_eq!(landmark.task_ids, ["known-task"]);
        assert_eq!(landmark.person_ids, ["known-person"]);
        assert_eq!(landmark.memory_ids, ["known-memory"]);
    }

    #[test]
    fn portable_assets_survive_world_switches() {
        let mut first = mock_world().expect("mock world should parse");
        let assets = split_assets(&mut first);
        assert!(!assets.objects.garden.is_empty());
        let mut second = first.clone();
        second.id = "another-topia".into();
        merge_assets(&mut second, &assets);
        assert!(second.scenes.garden.objects.iter().any(|object| {
            object.layer == TopiaObjectLayer::Crop || object.layer == TopiaObjectLayer::Souvenir
        }));
        assert!(assets
            .memories
            .iter()
            .all(|memory| memory.id.starts_with("topia-asset-")));
    }

    #[test]
    fn generated_world_requires_portals_room_and_crop_island() {
        let mut world = mock_world().expect("mock world should parse");
        world
            .scenes
            .exterior
            .objects
            .retain(|object| object.anchor_id.as_deref() != Some("portal-interior"));
        assert!(validate_world(&world).is_err());
    }

    #[test]
    fn souvenir_requires_its_own_sparkle_and_landmark() {
        let mut world = mock_world().expect("mock world should parse");
        let souvenir = world
            .scenes
            .exterior
            .objects
            .iter_mut()
            .find(|object| object.layer == TopiaObjectLayer::Souvenir)
            .expect("mock should expose a souvenir");
        souvenir.animation = Some("float".into());
        assert!(validate_world(&world).is_err());
    }

    #[test]
    fn iteration_prompt_preserves_style_and_assets() {
        let mut world = mock_world().expect("mock world should parse");
        let assets = split_assets(&mut world);
        let input = TopiaGenerationInput {
            profile: TopiaUserProfileInput {
                display_name: None,
                summary: "延续旧世界".into(),
                traits: vec![],
                experiences: vec![],
                preferences: vec![],
                imagery: vec![],
                sensations: vec![],
                style_preferences: vec![],
            },
            context: TopiaRuntimeContext::default(),
        };
        let value = prompt::build_iteration(&world, &assets, &input)
            .expect("iteration prompt should serialize");
        assert!(value.contains("ITERATION, not a redesign"));
        assert!(value.contains("Never delete a souvenir"));
    }

    #[test]
    fn render_style_selection_is_backend_owned_and_valid() {
        let input = TopiaGenerationInput {
            profile: TopiaUserProfileInput {
                display_name: None,
                summary: "想要有手作触感的空间".into(),
                traits: vec![],
                experiences: vec![],
                preferences: vec![],
                imagery: vec![],
                sensations: vec![],
                style_preferences: vec!["手工肌理".into()],
            },
            context: TopiaRuntimeContext::default(),
        };
        let style = choose_render_style(&input).expect("style selection should work");
        assert!(matches!(
            style.kind,
            TopiaRenderStyleKind::PaperCraft
                | TopiaRenderStyleKind::StorybookInk
                | TopiaRenderStyleKind::PlushToy
        ));
        assert!(style.seed > 0);
    }

    #[test]
    fn review_prompt_checks_non_literal_imagery_and_can_be_parsed() {
        let world = mock_world().expect("mock world should parse");
        let input = TopiaGenerationInput {
            profile: TopiaUserProfileInput {
                display_name: None,
                summary: "抽象关联".into(),
                traits: vec![],
                experiences: vec!["风经过时展开的纸船".into()],
                preferences: vec![],
                imagery: vec!["灯亮之前".into()],
                sensations: vec![],
                style_preferences: vec!["完全随机".into()],
            },
            context: TopiaRuntimeContext::default(),
        };
        let value = prompt::build_review(
            &input,
            r#"{"imageryTranslation":[{"forbiddenLiteralObjects":["纸船"]}]}"#,
            &world,
            &TopiaAssetLayer::default(),
            Some("example schema issue"),
        )
        .expect("review prompt should serialize");
        assert!(value.contains("not noun copying"));
        assert!(value.contains("forbiddenLiteralObjects"));
        assert!(value.contains("example schema issue"));
        let review = parse_review(
            r#"```json
            {"approved":false,"issues":["literal imagery"],"repairInstructions":"abstract it"}
            ```"#,
        )
        .expect("review should parse fenced json");
        assert!(!review.approved);
        assert_eq!(review.issues, ["literal imagery"]);
    }

    #[test]
    fn fresh_studio_requires_onboarding_and_keeps_default_first() {
        let mut state = initial_studio().expect("initial studio should load");
        assert_eq!(state.onboarding_completed, Some(false));
        assert_eq!(
            state.worlds.first().map(|world| world.source.as_str()),
            Some("mock")
        );
        let mut custom = state.worlds[0].clone();
        custom.id = "custom-first-by-mistake".into();
        custom.source = "cloud".into();
        state.worlds = vec![custom];
        ensure_default_world(&mut state).expect("default world should be restored");
        assert_eq!(state.worlds.len(), 2);
        assert_eq!(state.worlds[0].source, "mock");
        assert!(state
            .assets
            .objects
            .exterior
            .iter()
            .chain(&state.assets.objects.interior)
            .chain(&state.assets.objects.garden)
            .all(|object| object.layer != TopiaObjectLayer::Souvenir));
    }

    #[test]
    fn studio_summary_exposes_saved_thumbnail_without_touching_world() {
        let mut state = initial_studio().expect("initial studio should load");
        let id = state.active_world_id.clone();
        state
            .thumbnails
            .insert(id.clone(), "data:image/jpeg;base64,ZmFrZQ==".into());
        let studio = studio_payload(&state);
        assert_eq!(studio.worlds[0].id, id);
        assert_eq!(
            studio.worlds[0].thumbnail.as_deref(),
            Some("data:image/jpeg;base64,ZmFrZQ==")
        );
        assert!(serde_json::to_string(&state.worlds[0])
            .expect("world should serialize")
            .find("data:image/jpeg")
            .is_none());
    }
}
