mod harness;
mod prompt;

#[cfg(mobile)]
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::PathBuf;
#[cfg(mobile)]
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const WORLD_FILE: &str = "topia-studio-v2.json";
const LEGACY_WORLD_FILE: &str = "topia-world-v1.json";
const MOCK_WORLD: &str = include_str!("mock_world.json");
const TOPIA_CLOUD_TIMEOUT_MS: u32 = 180_000;
const TOPIA_STAGE_REPAIR_ATTEMPTS: usize = 1;

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
    #[serde(
        default,
        skip_serializing_if = "Vec::is_empty",
        deserialize_with = "deserialize_flexible_colors"
    )]
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
    #[serde(default)]
    yaw: f64,
    #[serde(default = "default_camera_pitch")]
    pitch: f64,
}

fn default_camera_pitch() -> f64 {
    0.58
}

impl Default for TopiaCamera {
    fn default() -> Self {
        Self {
            yaw: 0.0,
            pitch: default_camera_pitch(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TopiaSceneConfig {
    #[serde(default)]
    camera: TopiaCamera,
    #[serde(default)]
    objects: Vec<TopiaObjectConfig>,
    #[serde(default)]
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

#[derive(Clone, Debug, Deserialize, Serialize)]
struct TopiaGenerationConcept {
    title: String,
    archetype: String,
    palette: [u32; 3],
    sky: TopiaSkyConfig,
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
    let structure_is_valid = match location {
        TopiaLocation::Exterior => {
            scene
                .objects
                .iter()
                .any(|object| object.prefab == TopiaPrefab::FloatingIsland)
                && scene.objects.iter().any(|object| {
                    object.prefab == TopiaPrefab::Door
                        && object.anchor_id.as_deref() == Some("portal-interior")
                })
                && scene
                    .objects
                    .iter()
                    .any(|object| object.anchor_id.as_deref() == Some("portal-garden"))
        }
        TopiaLocation::Interior => {
            scene
                .objects
                .iter()
                .filter(|object| object.prefab == TopiaPrefab::RoomShell)
                .count()
                == 1
        }
        TopiaLocation::Garden => scene
            .objects
            .iter()
            .any(|object| object.prefab == TopiaPrefab::FloatingIsland),
    };
    if !structure_is_valid {
        return Err(match location {
            TopiaLocation::Exterior => {
                "Exterior must contain a floating home, portal-interior door and portal-garden anchor"
            }
            TopiaLocation::Interior => "Interior must contain exactly one room-shell",
            TopiaLocation::Garden => "Garden must contain a floating-island",
        }
        .into());
    }
    for souvenir in scene
        .objects
        .iter()
        .filter(|object| object.layer == TopiaObjectLayer::Souvenir)
    {
        let anchor = souvenir
            .anchor_id
            .as_deref()
            .ok_or_else(|| format!("{} souvenir has no anchor", souvenir.id))?;
        if souvenir.animation.as_deref() != Some("sparkle")
            || !scene
                .landmarks
                .iter()
                .any(|landmark| landmark.anchor_id == anchor)
        {
            return Err(format!(
                "{} souvenir must sparkle and have a landmark matching anchor {}",
                souvenir.id, anchor
            ));
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
    let review: TopiaGenerationReview =
        serde_json::from_value(extract_json(value)?).map_err(|error| error.to_string())?;
    if review.issues.len() > 24
        || review.issues.iter().any(|issue| !valid_text(issue, 500))
        || review.repair_instructions.chars().count() > 2_000
        || (!review.approved && review.issues.is_empty())
    {
        return Err("cloud returned an invalid or incomplete Topia review".into());
    }
    Ok(review)
}

fn parse_concept(value: &str) -> Result<TopiaGenerationConcept, String> {
    let value = extract_json(value)?;
    let object = value
        .as_object()
        .ok_or_else(|| "concept response must be a JSON object".to_string())?;
    let defaults = TopiaSkyConfig::default();
    let sky = object.get("sky").and_then(Value::as_object);
    let sky_value = |key: &str| sky.and_then(|value| value.get(key));
    let default_palette = [defaults.top, defaults.mid, defaults.low];
    let palette = object
        .get("palette")
        .and_then(Value::as_array)
        .map(|values| {
            std::array::from_fn(|index| {
                values
                    .get(index)
                    .and_then(parse_flexible_color)
                    .unwrap_or(default_palette[index])
            })
        })
        .unwrap_or(default_palette);
    let concept = TopiaGenerationConcept {
        title: concept_text(object.get("title"), "云上漂流屋", 48),
        archetype: concept_text(object.get("archetype"), "漂浮的私人幻想居所", 100),
        palette,
        sky: TopiaSkyConfig {
            theme: concept_text(sky_value("theme"), &defaults.theme, 48),
            motifs: sky_value("motifs")
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .map(|value| value.trim().chars().take(48).collect::<String>())
                        .filter(|value| !value.is_empty())
                        .take(8)
                        .collect()
                })
                .filter(|values: &Vec<String>| !values.is_empty())
                .unwrap_or(defaults.motifs),
            celestial_shape: concept_text(
                sky_value("celestialShape"),
                &defaults.celestial_shape,
                48,
            ),
            decoration_density: concept_ratio(
                sky_value("decorationDensity"),
                defaults.decoration_density,
            ),
            drift: concept_ratio(sky_value("drift"), defaults.drift),
            top: sky_value("top")
                .and_then(parse_flexible_color)
                .unwrap_or(defaults.top),
            mid: sky_value("mid")
                .and_then(parse_flexible_color)
                .unwrap_or(defaults.mid),
            low: sky_value("low")
                .and_then(parse_flexible_color)
                .unwrap_or(defaults.low),
            aurora: sky_value("aurora")
                .and_then(parse_flexible_color)
                .unwrap_or(defaults.aurora),
            celestial: sky_value("celestial")
                .and_then(parse_flexible_color)
                .unwrap_or(defaults.celestial),
            stars: sky_value("stars")
                .and_then(parse_flexible_color)
                .unwrap_or(defaults.stars),
            fog: sky_value("fog")
                .and_then(parse_flexible_color)
                .unwrap_or(defaults.fog),
            magic: concept_ratio(sky_value("magic"), defaults.magic),
        },
    };
    validate_concept(&concept)?;
    Ok(concept)
}

fn concept_text(value: Option<&Value>, fallback: &str, max_chars: usize) -> String {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .chars()
        .take(max_chars)
        .collect()
}

fn concept_ratio(value: Option<&Value>, fallback: f64) -> f64 {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| value.clamp(0.0, 1.0))
        .unwrap_or(fallback)
}

fn parse_flexible_color(value: &Value) -> Option<u32> {
    if let Some(value) = value.as_u64() {
        return Some(value.min(0x00ff_ffff) as u32);
    }
    if let Some(value) = value.as_str() {
        let value = value.trim().trim_start_matches('#');
        return u32::from_str_radix(value, 16)
            .ok()
            .filter(|color| *color <= 0x00ff_ffff);
    }
    if let Some(rgb) = value.as_array().filter(|rgb| rgb.len() >= 3) {
        let channel = |index: usize| rgb.get(index)?.as_u64().map(|value| value.min(255) as u32);
        return Some((channel(0)? << 16) | (channel(1)? << 8) | channel(2)?);
    }
    let rgb = value.as_object()?;
    let channel = |key: &str| rgb.get(key)?.as_u64().map(|value| value.min(255) as u32);
    Some((channel("r")? << 16) | (channel("g")? << 8) | channel("b")?)
}

fn deserialize_flexible_colors<'de, D>(deserializer: D) -> Result<Vec<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let values = Vec::<Value>::deserialize(deserializer)?;
    Ok(values
        .iter()
        .filter_map(parse_flexible_color)
        .take(8)
        .collect())
}

fn validate_concept(concept: &TopiaGenerationConcept) -> Result<(), String> {
    if !valid_text(&concept.title, 48)
        || !valid_text(&concept.archetype, 100)
        || concept.palette.iter().any(|color| *color > 0x00ff_ffff)
        || !valid_text(&concept.sky.theme, 48)
        || !valid_text(&concept.sky.celestial_shape, 48)
        || concept.sky.motifs.len() > 8
        || concept
            .sky
            .motifs
            .iter()
            .any(|motif| !valid_text(motif, 48))
        || !(0.0..=1.0).contains(&concept.sky.decoration_density)
        || !(0.0..=1.0).contains(&concept.sky.drift)
        || !(0.0..=1.0).contains(&concept.sky.magic)
        || [
            concept.sky.top,
            concept.sky.mid,
            concept.sky.low,
            concept.sky.aurora,
            concept.sky.celestial,
            concept.sky.stars,
            concept.sky.fog,
        ]
        .iter()
        .any(|color| *color > 0x00ff_ffff)
    {
        return Err("cloud returned invalid Topia concept metadata or sky".into());
    }
    Ok(())
}

fn inspect_scene(
    value: &str,
    location: TopiaLocation,
) -> Result<(TopiaSceneConfig, Option<String>), String> {
    let mut scene: TopiaSceneConfig =
        serde_json::from_value(extract_json(value)?).map_err(|error| error.to_string())?;
    let before = (scene.camera.yaw, scene.camera.pitch);
    normalize_scene_contract(&mut scene, location)?;
    let after = (scene.camera.yaw, scene.camera.pitch);
    validate_scene(&scene, location)?;
    let issue = (before != after).then(|| {
        format!(
            "{location:?} camera is out of range: yaw={} must be -3.2..3.2 and pitch={} must be 0.18..1.08. The backend fallback normalized it to yaw={} pitch={}; return an in-range camera explicitly.",
            before.0, before.1, after.0, after.1
        )
    });
    Ok((scene, issue))
}

fn normalize_scene_contract(
    scene: &mut TopiaSceneConfig,
    location: TopiaLocation,
) -> Result<(), String> {
    normalize_scene_camera(scene);
    scene.objects.truncate(40);
    for (index, object) in scene.objects.iter_mut().enumerate() {
        if !valid_text(&object.id, 64) {
            object.id = format!("generated-{location:?}-{index}").to_lowercase();
        }
        for value in &mut object.position {
            *value = if value.is_finite() {
                value.clamp(-8.0, 8.0)
            } else {
                0.0
            };
        }
        if let Some(rotation) = &mut object.rotation {
            for value in rotation {
                *value = if value.is_finite() {
                    value.clamp(-std::f64::consts::TAU, std::f64::consts::TAU)
                } else {
                    0.0
                };
            }
        }
        if let Some(scale) = &mut object.scale {
            for value in scale {
                *value = if value.is_finite() {
                    value.clamp(0.1, 4.0)
                } else {
                    1.0
                };
            }
        }
        object.colors.truncate(8);
        object.params.retain(|key, value| {
            valid_text(key, 40)
                && match value {
                    Value::Bool(_) => true,
                    Value::String(value) => value.chars().count() <= 64,
                    Value::Number(value) => value
                        .as_f64()
                        .is_some_and(|number| number.is_finite() && number.abs() <= 20.0),
                    _ => false,
                }
        });
        if object
            .animation
            .as_deref()
            .is_some_and(|value| !matches!(value, "float" | "spin" | "sway" | "sparkle"))
        {
            object.animation = None;
        }
    }

    let skeleton = fallback_scene(
        location,
        &TopiaGenerationConcept {
            title: "fallback".into(),
            archetype: "fallback".into(),
            palette: [0x7898c8, 0xd8a8b8, 0x88b89c],
            sky: TopiaSkyConfig::default(),
        },
    )?;
    let required = |scene: &TopiaSceneConfig, object: &TopiaObjectConfig| match location {
        TopiaLocation::Exterior => {
            (object.prefab == TopiaPrefab::FloatingIsland
                && !scene
                    .objects
                    .iter()
                    .any(|item| item.prefab == TopiaPrefab::FloatingIsland))
                || (object.anchor_id.as_deref() == Some("portal-interior")
                    && !scene.objects.iter().any(|item| {
                        item.prefab == TopiaPrefab::Door
                            && item.anchor_id.as_deref() == Some("portal-interior")
                    }))
                || (object.anchor_id.as_deref() == Some("portal-garden")
                    && !scene
                        .objects
                        .iter()
                        .any(|item| item.anchor_id.as_deref() == Some("portal-garden")))
        }
        TopiaLocation::Interior => {
            object.prefab == TopiaPrefab::RoomShell
                && !scene
                    .objects
                    .iter()
                    .any(|item| item.prefab == TopiaPrefab::RoomShell)
        }
        TopiaLocation::Garden => {
            object.prefab == TopiaPrefab::FloatingIsland
                && !scene
                    .objects
                    .iter()
                    .any(|item| item.prefab == TopiaPrefab::FloatingIsland)
        }
    };
    for object in &skeleton.objects {
        if required(scene, object) {
            scene.objects.push(object.clone());
        }
    }
    for object in &skeleton.objects {
        if scene.objects.len() >= 8 {
            break;
        }
        if !scene.objects.iter().any(|item| item.id == object.id) && object.anchor_id.is_none() {
            scene.objects.push(object.clone());
        }
    }

    let mut ids = HashSet::new();
    for (index, object) in scene.objects.iter_mut().enumerate() {
        if !ids.insert(object.id.clone()) {
            object.id = format!("{}-{index}", object.id);
            ids.insert(object.id.clone());
        }
    }
    if location == TopiaLocation::Interior {
        let mut room_seen = false;
        for object in &mut scene.objects {
            if object.prefab == TopiaPrefab::RoomShell {
                if room_seen {
                    object.prefab = TopiaPrefab::Block;
                }
                room_seen = true;
            }
        }
    }

    scene.landmarks.truncate(8);
    let anchors: HashSet<_> = scene
        .objects
        .iter()
        .filter_map(|object| object.anchor_id.as_deref())
        .collect();
    let mut landmark_ids = HashSet::new();
    scene.landmarks.retain_mut(|landmark| {
        landmark.location = location;
        landmark.label = landmark.label.chars().take(36).collect();
        landmark.eyebrow = landmark.eyebrow.chars().take(36).collect();
        landmark.description = landmark.description.chars().take(360).collect();
        if !valid_percentage(&landmark.fallback_placement.left) {
            landmark.fallback_placement.left = "50%".into();
        }
        if !valid_percentage(&landmark.fallback_placement.top) {
            landmark.fallback_placement.top = "50%".into();
        }
        anchors.contains(landmark.anchor_id.as_str())
            && valid_text(&landmark.id, 64)
            && landmark_ids.insert(landmark.id.clone())
            && valid_text(&landmark.emoji, 8)
            && valid_text(&landmark.label, 36)
            && valid_text(&landmark.eyebrow, 36)
            && valid_text(&landmark.description, 360)
    });
    let landmark_anchors: HashSet<_> = scene
        .landmarks
        .iter()
        .map(|landmark| landmark.anchor_id.as_str())
        .collect();
    for object in &mut scene.objects {
        if object.layer == TopiaObjectLayer::Souvenir
            && (object.animation.as_deref() != Some("sparkle")
                || object
                    .anchor_id
                    .as_deref()
                    .is_none_or(|anchor| !landmark_anchors.contains(anchor)))
        {
            object.layer = TopiaObjectLayer::Decoration;
            object.memory_ids.clear();
        }
    }
    Ok(())
}

fn normalize_scene_camera(scene: &mut TopiaSceneConfig) {
    if !scene.camera.yaw.is_finite() {
        scene.camera.yaw = 0.0;
    }
    if !scene.camera.pitch.is_finite() {
        scene.camera.pitch = 0.58;
    }
    scene.camera.yaw = scene.camera.yaw.clamp(-3.2, 3.2);
    scene.camera.pitch = scene.camera.pitch.clamp(0.18, 1.08);
}

fn fallback_concept(input: &TopiaGenerationInput) -> TopiaGenerationConcept {
    let defaults = TopiaSkyConfig::default();
    let mut hasher = DefaultHasher::new();
    serde_json::to_string(&input.profile)
        .unwrap_or_default()
        .hash(&mut hasher);
    let seed = hasher.finish() as u32;
    let title = input
        .profile
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| format!("{name}的漂流居所"))
        .unwrap_or_else(|| "云上漂流屋".into());
    let rotate = |color: u32, offset: u32| (color.rotate_left(offset % 24)) & 0x00ff_ffff;
    TopiaGenerationConcept {
        title: title.chars().take(48).collect(),
        archetype: input
            .profile
            .summary
            .split(['。', '，', ','])
            .next()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("温暖而开放的私人幻想居所")
            .trim()
            .chars()
            .take(100)
            .collect(),
        palette: [
            rotate(defaults.top, seed % 19),
            rotate(defaults.mid, seed % 13),
            rotate(defaults.low, seed % 7),
        ],
        sky: defaults,
    }
}

fn fallback_scene(
    location: TopiaLocation,
    concept: &TopiaGenerationConcept,
) -> Result<TopiaSceneConfig, String> {
    let world = mock_world()?;
    let mut scene = match location {
        TopiaLocation::Exterior => world.scenes.exterior,
        TopiaLocation::Interior => world.scenes.interior,
        TopiaLocation::Garden => world.scenes.garden,
    };
    let palette = concept.palette;
    for (object_index, object) in scene.objects.iter_mut().enumerate() {
        if object.layer == TopiaObjectLayer::Structure {
            for (color_index, color) in object.colors.iter_mut().enumerate() {
                *color = palette[(object_index + color_index) % palette.len()];
            }
        }
    }
    validate_scene(&scene, location)?;
    Ok(scene)
}

#[cfg(mobile)]
fn assemble_generated_world(
    input: &TopiaGenerationInput,
    concept: TopiaGenerationConcept,
    render_style: TopiaRenderStyleConfig,
    scenes: TopiaScenes,
) -> Result<TopiaWorldConfig, String> {
    validate_concept(&concept)?;
    Ok(TopiaWorldConfig {
        schema_version: 2,
        id: format!("topia-{}", Utc::now().timestamp_millis()),
        owner_id: "local-user".into(),
        revision: 1,
        generated_at: Utc::now().to_rfc3339(),
        source: "cloud".into(),
        profile: TopiaWorldProfile {
            home_name: concept.title,
            archetype: concept.archetype,
            traits: input.profile.traits.clone(),
            experiences: input.profile.experiences.clone(),
            accent_colors: concept.palette,
        },
        sky: concept.sky,
        render_style,
        scenes,
        generation: None,
    })
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
    crate::diagnostics::log(
        app,
        "topia",
        "stage",
        &format!("mode={mode} stage={stage} progress={progress} message={message}"),
    );
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

#[cfg(mobile)]
fn complete_topia_stage(
    app: &tauri::AppHandle,
    stage: &str,
    request: crate::mobile_cloud::CompleteRequest<'_>,
) -> Result<crate::CloudModelResult, String> {
    let started = Instant::now();
    crate::diagnostics::log(app, "topia", "request-start", &format!("stage={stage}"));
    let result = app
        .state::<crate::mobile_cloud::RealiaCloud<tauri::Wry>>()
        .complete(request);
    match &result {
        Ok(value) => crate::diagnostics::log(
            app,
            "topia",
            "request-ok",
            &format!(
                "stage={stage} elapsed_ms={} provider={} model={} response_chars={}",
                started.elapsed().as_millis(),
                value.provider,
                value.model,
                value.text.chars().count()
            ),
        ),
        Err(error) => crate::diagnostics::log(
            app,
            "topia",
            "request-error",
            &format!(
                "stage={stage} elapsed_ms={} error={error}",
                started.elapsed().as_millis()
            ),
        ),
    }
    result
}

#[cfg(mobile)]
fn complete_validated_stage<T, F>(
    app: &tauri::AppHandle,
    mode: &str,
    stage: &str,
    progress: u8,
    repair_message: &str,
    original_prompt: &str,
    system: &str,
    validator: F,
) -> Result<(T, crate::CloudModelResult), String>
where
    F: Fn(&str) -> Result<T, String>,
{
    let mut request_prompt = original_prompt.to_string();
    for attempt in 0..=TOPIA_STAGE_REPAIR_ATTEMPTS {
        let request_stage = if attempt == 0 {
            stage.to_string()
        } else {
            format!("{stage}-repair-{attempt}")
        };
        let response = complete_topia_stage(
            app,
            &request_stage,
            crate::mobile_cloud::CompleteRequest {
                prompt: &request_prompt,
                system: Some(if attempt == 0 {
                    system
                } else {
                    prompt::REPAIR_SYSTEM_PROMPT
                }),
                json: true,
                timeout_ms: TOPIA_CLOUD_TIMEOUT_MS,
                max_completion_tokens: Some(harness::completion_budget(stage)),
                fast: true,
            },
        )?;
        match validator(&response.text) {
            Ok(value) => return Ok((value, response)),
            Err(error) if attempt < TOPIA_STAGE_REPAIR_ATTEMPTS => {
                crate::diagnostics::log(
                    app,
                    "topia",
                    "repair-requested",
                    &format!("stage={stage} attempt={} error={error}", attempt + 1),
                );
                emit_progress(
                    app,
                    mode,
                    stage,
                    progress,
                    &format!(
                        "{repair_message}（{}/{}）",
                        attempt + 1,
                        TOPIA_STAGE_REPAIR_ATTEMPTS
                    ),
                );
                request_prompt =
                    prompt::build_json_repair(stage, original_prompt, &response.text, &error);
            }
            Err(error) => {
                crate::diagnostics::log(
                    app,
                    "topia",
                    "repair-exhausted",
                    &format!("stage={stage} attempts={TOPIA_STAGE_REPAIR_ATTEMPTS} error={error}"),
                );
                return Err(format!(
                    "{stage} validation failed after model repair: {error}"
                ));
            }
        }
    }
    unreachable!()
}

#[cfg(mobile)]
fn complete_scene_stage(
    app: &tauri::AppHandle,
    mode: &str,
    stage: &str,
    progress: u8,
    repair_message: &str,
    original_prompt: &str,
    location: TopiaLocation,
) -> Result<(TopiaSceneConfig, crate::CloudModelResult), String> {
    let mut request_prompt = original_prompt.to_string();
    let mut normalized_fallback = None;
    for attempt in 0..=TOPIA_STAGE_REPAIR_ATTEMPTS {
        let request_stage = if attempt == 0 {
            stage.to_string()
        } else {
            format!("{stage}-repair-{attempt}")
        };
        let response = complete_topia_stage(
            app,
            &request_stage,
            crate::mobile_cloud::CompleteRequest {
                prompt: &request_prompt,
                system: Some(if attempt == 0 {
                    prompt::SCENE_SYSTEM_PROMPT
                } else {
                    prompt::REPAIR_SYSTEM_PROMPT
                }),
                json: true,
                timeout_ms: TOPIA_CLOUD_TIMEOUT_MS,
                max_completion_tokens: Some(harness::completion_budget(stage)),
                fast: true,
            },
        )?;
        let error = match inspect_scene(&response.text, location) {
            Ok((scene, None)) => return Ok((scene, response)),
            Ok((scene, Some(camera_issue))) => {
                crate::diagnostics::log(
                    app,
                    "topia",
                    "camera-normalized",
                    &format!("stage={stage} {camera_issue}"),
                );
                normalized_fallback = Some((scene, response.clone()));
                camera_issue
            }
            Err(error) => error,
        };
        if attempt == TOPIA_STAGE_REPAIR_ATTEMPTS {
            if let Some(fallback) = normalized_fallback {
                crate::diagnostics::log(
                    app,
                    "topia",
                    "camera-fallback-accepted",
                    &format!("stage={stage} after_model_repairs={TOPIA_STAGE_REPAIR_ATTEMPTS}"),
                );
                return Ok(fallback);
            }
            crate::diagnostics::log(
                app,
                "topia",
                "repair-exhausted",
                &format!("stage={stage} attempts={TOPIA_STAGE_REPAIR_ATTEMPTS} error={error}"),
            );
            return Err(format!(
                "{stage} validation failed after model repair: {error}"
            ));
        }
        crate::diagnostics::log(
            app,
            "topia",
            "repair-requested",
            &format!("stage={stage} attempt={} error={error}", attempt + 1),
        );
        emit_progress(
            app,
            mode,
            stage,
            progress,
            &format!(
                "{repair_message}（{}/{}）",
                attempt + 1,
                TOPIA_STAGE_REPAIR_ATTEMPTS
            ),
        );
        request_prompt = prompt::build_json_repair(stage, original_prompt, &response.text, &error);
    }
    unreachable!()
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

fn generate_topia_world_blocking(
    input: TopiaGenerationInput,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    emit_progress(&app, "create", "concept", 8, "正在读取你的意象");
    let render_style = choose_render_style(&input)?;
    let concept_prompt = prompt::build_concept(&input, &render_style)?;
    #[cfg(mobile)]
    let concept_result = complete_validated_stage(
        &app,
        "create",
        "concept",
        8,
        "正在修正世界概念",
        &concept_prompt,
        prompt::CONCEPT_SYSTEM_PROMPT,
        parse_concept,
    );
    #[cfg(not(mobile))]
    {
        let _ = (input, app, concept_prompt);
        return Err("Topia cloud generation is only available in the Android app".into());
    }
    #[cfg(mobile)]
    {
        let mut state = load_studio(&app)?;
        let (parsed_concept, concept_text, mut provider, mut model) = match concept_result {
            Ok((parsed, response)) => (parsed, response.text, response.provider, response.model),
            Err(error) => {
                let parsed = fallback_concept(&input);
                crate::diagnostics::log(
                    &app,
                    "topia",
                    "local-fallback",
                    &harness::fallback_summary("concept", &error),
                );
                emit_progress(&app, "create", "concept", 8, "云端较慢，正在本地整理创意");
                (
                    parsed,
                    serde_json::to_string(&fallback_concept(&input))
                        .map_err(|error| error.to_string())?,
                    "RealTopia Rust Harness".into(),
                    "deterministic-scene-compiler".into(),
                )
            }
        };

        emit_progress(&app, "create", "exterior", 22, "正在搭建屋外与浮空房屋");
        let exterior_prompt =
            prompt::build_scene_blueprint(&input, &concept_text, &render_style, "exterior")?;
        let (exterior, exterior_response) = match complete_validated_stage(
            &app,
            "create",
            "exterior-blueprint",
            22,
            "正在修正屋外场景",
            &exterior_prompt,
            prompt::BLUEPRINT_SYSTEM_PROMPT,
            |value| harness::compile_blueprint(value, TopiaLocation::Exterior, &parsed_concept),
        ) {
            Ok((scene, response)) => (scene, Some(response)),
            Err(error) => {
                crate::diagnostics::log(
                    &app,
                    "topia",
                    "local-fallback",
                    &harness::fallback_summary("exterior", &error),
                );
                emit_progress(&app, "create", "exterior", 22, "正在本地编译屋外场景");
                (
                    fallback_scene(TopiaLocation::Exterior, &parsed_concept)?,
                    None,
                )
            }
        };
        if let Some(response) = exterior_response {
            provider = response.provider;
            model = response.model;
        }

        emit_progress(&app, "create", "interior", 40, "正在布置室内房间");
        let interior_prompt =
            prompt::build_scene_blueprint(&input, &concept_text, &render_style, "interior")?;
        let interior = match complete_validated_stage(
            &app,
            "create",
            "interior-blueprint",
            40,
            "正在修正室内场景",
            &interior_prompt,
            prompt::BLUEPRINT_SYSTEM_PROMPT,
            |value| harness::compile_blueprint(value, TopiaLocation::Interior, &parsed_concept),
        ) {
            Ok((scene, response)) => {
                provider = response.provider;
                model = response.model;
                scene
            }
            Err(error) => {
                crate::diagnostics::log(
                    &app,
                    "topia",
                    "local-fallback",
                    &harness::fallback_summary("interior", &error),
                );
                emit_progress(&app, "create", "interior", 40, "正在本地编译室内场景");
                fallback_scene(TopiaLocation::Interior, &parsed_concept)?
            }
        };

        emit_progress(&app, "create", "garden", 56, "正在培育菜地与作物岛");
        let garden_prompt =
            prompt::build_scene_blueprint(&input, &concept_text, &render_style, "garden")?;
        let garden = match complete_validated_stage(
            &app,
            "create",
            "garden-blueprint",
            56,
            "正在修正菜地场景",
            &garden_prompt,
            prompt::BLUEPRINT_SYSTEM_PROMPT,
            |value| harness::compile_blueprint(value, TopiaLocation::Garden, &parsed_concept),
        ) {
            Ok((scene, response)) => {
                provider = response.provider;
                model = response.model;
                scene
            }
            Err(error) => {
                crate::diagnostics::log(
                    &app,
                    "topia",
                    "local-fallback",
                    &harness::fallback_summary("garden", &error),
                );
                emit_progress(&app, "create", "garden", 56, "正在本地编译菜地场景");
                fallback_scene(TopiaLocation::Garden, &parsed_concept)?
            }
        };

        emit_progress(&app, "create", "assembly", 70, "正在合并并校验三处场景");
        let mut candidate = assemble_generated_world(
            &input,
            parsed_concept.clone(),
            render_style,
            TopiaScenes {
                exterior,
                interior,
                garden,
            },
        )?;
        migrate_world(&mut candidate);
        filter_relations(&mut candidate, &input.context);
        emit_progress(&app, "create", "review", 76, "正在自动验收场景");
        if let Err(error) = validate_world(&candidate) {
            crate::diagnostics::log(&app, "topia", "local-reassembly", &format!("error={error}"));
            candidate = assemble_generated_world(
                &input,
                parsed_concept,
                candidate.render_style.clone(),
                TopiaScenes {
                    exterior: fallback_scene(TopiaLocation::Exterior, &fallback_concept(&input))?,
                    interior: fallback_scene(TopiaLocation::Interior, &fallback_concept(&input))?,
                    garden: fallback_scene(TopiaLocation::Garden, &fallback_concept(&input))?,
                },
            )?;
            migrate_world(&mut candidate);
            filter_relations(&mut candidate, &input.context);
            validate_world(&candidate)?;
        }
        emit_progress(&app, "create", "revision", 92, "场景已通过自动验收");
        emit_progress(&app, "create", "assets", 97, "正在保存资产与世界");
        let (world, mut generated_assets) =
            finalize_generated_world(candidate, &input, provider, model)?;
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
pub async fn generate_topia_world(
    input: TopiaGenerationInput,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    crate::diagnostics::log(&app, "topia", "generation-start", "mode=create");
    let diagnostic_app = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || generate_topia_world_blocking(input, app))
            .await
            .map_err(|error| format!("Topia 生成后台任务失败: {error}"))?;
    match &result {
        Ok(_) => crate::diagnostics::log(&diagnostic_app, "topia", "generation-ok", "mode=create"),
        Err(error) => crate::diagnostics::log(
            &diagnostic_app,
            "topia",
            "generation-error",
            &format!("mode=create error={error}"),
        ),
    }
    result
}

fn iterate_topia_world_blocking(
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
    let (parsed, response) = complete_validated_stage(
        &app,
        "iterate",
        "memory",
        12,
        "正在修正 Topia 迭代结果",
        &user_prompt,
        prompt::WORLD_SYSTEM_PROMPT,
        parse_world,
    )?;
    #[cfg(not(mobile))]
    {
        let _ = (input, app, user_prompt);
        return Err("Topia cloud generation is only available in the Android app".into());
    }
    #[cfg(mobile)]
    {
        emit_progress(&app, "iterate", "assets", 72, "正在让新故事长成纪念品");
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
pub async fn iterate_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    tauri::async_runtime::spawn_blocking(move || iterate_topia_world_blocking(context, app))
        .await
        .map_err(|error| format!("Topia 迭代后台任务失败: {error}"))?
}

fn maintain_topia_world_blocking(
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
        return iterate_topia_world_blocking(context, app).map(Some);
    }
    #[cfg(not(mobile))]
    {
        let _ = (context, app, digest, state);
        Ok(None)
    }
}

#[tauri::command]
pub async fn maintain_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<Option<TopiaWorldPayload>, String> {
    tauri::async_runtime::spawn_blocking(move || maintain_topia_world_blocking(context, app))
        .await
        .map_err(|error| format!("Topia 后台维护任务失败: {error}"))?
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
        let exterior = prompt::build_scene(
            &input,
            &concept,
            &TopiaAssetLayer::default(),
            &style,
            "exterior",
        )
        .expect("exterior prompt should serialize");
        let interior = prompt::build_scene(
            &input,
            &concept,
            &TopiaAssetLayer::default(),
            &style,
            "interior",
        )
        .expect("interior prompt should serialize");
        let garden = prompt::build_scene(
            &input,
            &concept,
            &TopiaAssetLayer::default(),
            &style,
            "garden",
        )
        .expect("garden prompt should serialize");
        assert!(exterior.contains("floating home"));
        assert!(interior.contains("room-shell"));
        assert!(garden.contains("crop-plots"));
        assert!(exterior.contains("测试用户"));
        assert!(exterior.contains("Scene JSON only"));
        assert!(exterior.contains("NON-LITERAL IMAGERY RULE"));
        assert!(concept.contains("paper boat must not cause a paper boat object"));
        assert!(prompt::WORLD_SYSTEM_PROMPT.contains("sad adds rain"));
        assert!(prompt::SCENE_SYSTEM_PROMPT.contains("one scene"));
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
    fn generated_scene_camera_is_normalized_before_validation() {
        let world = mock_world().expect("mock world should parse");
        let mut scene = world.scenes.exterior;
        scene.camera.yaw = 8.5;
        scene.camera.pitch = -2.0;
        normalize_scene_camera(&mut scene);
        assert_eq!(scene.camera.yaw, 3.2);
        assert_eq!(scene.camera.pitch, 0.18);
        validate_scene(&scene, TopiaLocation::Exterior)
            .expect("normalized camera should pass scene validation");
    }

    #[test]
    fn scene_inspection_reports_camera_repair_feedback_and_keeps_a_safe_fallback() {
        let world = mock_world().expect("mock world should parse");
        let mut scene = world.scenes.exterior;
        scene.camera.yaw = 8.5;
        scene.camera.pitch = -2.0;
        let json = serde_json::to_string(&scene).expect("scene should serialize");
        let (safe, issue) =
            inspect_scene(&json, TopiaLocation::Exterior).expect("scene should be repairable");
        assert_eq!(safe.camera.yaw, 3.2);
        assert_eq!(safe.camera.pitch, 0.18);
        let issue = issue.expect("out-of-range camera must be sent back to the model");
        assert!(issue.contains("yaw=8.5"));
        assert!(issue.contains("pitch=-2"));
        assert!(issue.contains("return an in-range camera explicitly"));
    }

    #[test]
    fn repair_prompt_contains_original_contract_candidate_and_validator_feedback() {
        let repair = prompt::build_json_repair(
            "exterior",
            "must contain portal-interior",
            r#"{"camera":{"yaw":9}}"#,
            "camera is out of range",
        );
        assert!(repair.contains("must contain portal-interior"));
        assert!(repair.contains(r#"{"camera":{"yaw":9}}"#));
        assert!(repair.contains("camera is out of range"));
        assert!(repair.contains("complete corrected replacement"));
    }

    #[test]
    fn concept_parser_accepts_common_model_color_formats_and_clamps_soft_values() {
        let concept = parse_concept(
            r##"{
                "title":"绒光观星屋",
                "archetype":"温柔的漂浮观测站",
                "palette":[[255,128,2],"#102030",16777215],
                "sky":{
                    "theme":"晚霞梦境",
                    "motifs":["star-dust"],
                    "celestialShape":"prism",
                    "decorationDensity":1.8,
                    "drift":-0.4,
                    "top":[10,20,30],
                    "mid":"#405060",
                    "low":66051,
                    "aurora":{"r":70,"g":80,"b":90},
                    "celestial":[255,240,180],
                    "stars":"ffffff",
                    "fog":[210,220,230],
                    "magic":3
                }
            }"##,
        )
        .expect("common model color formats should be accepted locally");
        assert_eq!(concept.palette, [0xff8002, 0x102030, 0xffffff]);
        assert_eq!(concept.sky.top, 0x0a141e);
        assert_eq!(concept.sky.mid, 0x405060);
        assert_eq!(concept.sky.aurora, 0x46505a);
        assert_eq!(concept.sky.decoration_density, 1.0);
        assert_eq!(concept.sky.drift, 0.0);
        assert_eq!(concept.sky.magic, 1.0);
    }

    #[test]
    fn concept_parser_fills_nonessential_fields_instead_of_rejecting_the_stage() {
        let concept = parse_concept(r#"{"title":"只有一个名字"}"#)
            .expect("missing nonessential concept fields should use backend defaults");
        assert_eq!(concept.title, "只有一个名字");
        assert!(!concept.archetype.is_empty());
        validate_concept(&concept).expect("normalized concept should remain valid");
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
