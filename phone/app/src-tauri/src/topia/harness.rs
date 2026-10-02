#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FailureKind {
    Transport,
    JsonSyntax,
    RuntimeContract,
}

pub fn classify_failure(error: &str) -> FailureKind {
    let lower = error.to_ascii_lowercase();
    if lower.contains("timeout")
        || lower.contains("超时")
        || lower.contains("http ")
        || lower.contains("tls")
        || lower.contains("service")
    {
        FailureKind::Transport
    } else if lower.contains("json")
        || lower.contains("expected")
        || lower.contains("missing field")
        || lower.contains("invalid type")
    {
        FailureKind::JsonSyntax
    } else {
        FailureKind::RuntimeContract
    }
}

pub fn completion_budget(stage: &str) -> u32 {
    match stage {
        "design-brief" => 768,
        "concept" | "review" => 1_024,
        stage if stage.contains("blueprint") => 1_536,
        "memory" | "detail-plan" | "detail-review" => 1_024,
        "souvenir-design" | "souvenir-review" => 768,
        _ => 2_048,
    }
}

pub const GENERATION_BUDGET_MS: u32 = 40_000;

/// Short per-stage caps share a single deadline, including repairs and queueing.
pub fn request_budget(stage: &str, remaining_ms: u32) -> Result<u32, String> {
    if remaining_ms < 500 {
        return Err("Topia generation budget exhausted".into());
    }
    let cap = match stage {
        "design-brief" => 7_000,
        "concept" => 12_000,
        stage if stage.contains("blueprint") => 12_000,
        _ => 8_000,
    };
    Ok(remaining_ms.min(cap))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneBlueprint {
    #[serde(default = "default_density")]
    density: f64,
    #[serde(default)]
    camera_yaw: Option<f64>,
    #[serde(default)]
    camera_pitch: Option<f64>,
    #[serde(default)]
    silhouette: String,
    #[serde(default)]
    habitat_form: String,
    #[serde(default)]
    architecture_style: String,
    #[serde(default)]
    layout: String,
    #[serde(default)]
    features: Vec<BlueprintFeature>,
    #[serde(default)]
    island_shape: String,
    #[serde(default)]
    island_aspect: Option<f64>,
    #[serde(default)]
    island_depth: Option<f64>,
    #[serde(default)]
    room_shape: String,
    #[serde(default)]
    room_scale: Option<[f64; 2]>,
    #[serde(default)]
    massing: Vec<BlueprintMass>,
    #[serde(default)]
    furnishings: Vec<BlueprintPlacement>,
    #[serde(default)]
    plots: Vec<[f64; 2]>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlueprintMass {
    kind: String,
    position: [f64; 2],
    size: [f64; 3],
    #[serde(default)]
    rotation: f64,
    #[serde(default)]
    support: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlueprintPlacement {
    kind: String,
    position: [f64; 2],
    #[serde(default)]
    rotation: f64,
    #[serde(default)]
    scale: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlueprintFeature {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    color: Option<Value>,
    #[serde(default)]
    animation: Option<String>,
    #[serde(default = "default_emphasis")]
    emphasis: f64,
}

fn default_density() -> f64 {
    0.5
}

fn default_emphasis() -> f64 {
    0.5
}

fn feature_prefab(value: &str) -> Option<TopiaPrefab> {
    Some(match value.trim().to_ascii_lowercase().as_str() {
        "tower" => TopiaPrefab::Tower,
        "sail" => TopiaPrefab::Sail,
        "wind-chimes" | "chimes" => TopiaPrefab::WindChimes,
        "observatory" => TopiaPrefab::Observatory,
        "crystal" => TopiaPrefab::Crystal,
        "cloud" => TopiaPrefab::Cloud,
        "sky-window" => TopiaPrefab::SkyWindow,
        "plant" => TopiaPrefab::Plant,
        "hearth" => TopiaPrefab::Hearth,
        "rug" => TopiaPrefab::Rug,
        "lantern" => TopiaPrefab::Lantern,
        "propeller" => TopiaPrefab::Propeller,
        "path" => TopiaPrefab::Path,
        "farm-shed" => TopiaPrefab::FarmShed,
        "watering-orb" => TopiaPrefab::WateringOrb,
        _ => return None,
    })
}

fn structure_object(
    id: &str,
    prefab: TopiaPrefab,
    position: [f64; 3],
    scale: [f64; 3],
    colors: Vec<u32>,
) -> TopiaObjectConfig {
    TopiaObjectConfig {
        id: id.into(),
        prefab,
        layer: TopiaObjectLayer::Structure,
        position,
        rotation: None,
        scale: Some(scale),
        colors,
        params: HashMap::from([("structural".into(), Value::Bool(true))]),
        anchor_id: None,
        task_id: None,
        memory_ids: vec![],
        animation: None,
    }
}

fn with_anchor(mut object: TopiaObjectConfig, anchor: &str) -> TopiaObjectConfig {
    object.anchor_id = Some(anchor.into());
    object
}

fn with_rotation(mut object: TopiaObjectConfig, rotation: [f64; 3]) -> TopiaObjectConfig {
    object.rotation = Some(rotation);
    object
}

fn with_params(mut object: TopiaObjectConfig, params: &[(&str, f64)]) -> TopiaObjectConfig {
    object.params.extend(
        params
            .iter()
            .map(|(key, value)| ((*key).into(), Value::from(*value))),
    );
    object
}

fn selected_token<'a>(value: &'a str, supported: &[&'a str], fallback: usize) -> &'a str {
    let value = value.trim().to_ascii_lowercase();
    supported
        .iter()
        .copied()
        .find(|candidate| *candidate == value)
        .unwrap_or(supported[fallback % supported.len()])
}

fn architecture_palette(style: &str, concept: &TopiaGenerationConcept) -> [u32; 4] {
    match style {
        "cloud-organic" => [0xf7fbff, 0xcdeeff, concept.palette[1], 0xffeaa7],
        "cycladic-white" => [0xf7f2df, 0x3178b8, 0xe8dcc1, 0x244965],
        "chinese-thatch" => [0xd9c7a2, 0x725535, 0x9f4938, 0xf0dfb1],
        "chinese-red-wall" => [0xa73535, 0x292b32, 0xd5a642, 0xefe1c1],
        "jiangnan-white-wall" => [0xf1eee4, 0x252c31, 0x5f8f86, 0xb38a63],
        "american-modern" => [0xeeeae2, 0x343b43, 0x73c4d5, 0xa97b58],
        "coral-fantasy" => [0xf07b70, 0x4db5ad, 0xf3c768, 0x8b5fa8],
        "ancient-greek" => [0xf1ead8, 0x6089b5, 0xc6a15b, 0x59606d],
        _ => [
            concept.palette[0],
            concept.palette[1],
            concept.palette[2],
            0xf3ead1,
        ],
    }
}

fn island_palette(style: &str, concept: &TopiaGenerationConcept) -> [u32; 3] {
    match style {
        "cloud-organic" => [0xc8e6cf, 0xb8a9bd, 0xcdeeff],
        "cycladic-white" => [0xa8b98a, 0x766b62, 0x8fb4bc],
        "chinese-thatch" => [0x7fa56e, 0x725535, 0xd9c7a2],
        "chinese-red-wall" => [0x789c68, 0x74533d, 0xa73535],
        "jiangnan-white-wall" => [0x7c9f73, 0x5b5147, 0xb38a63],
        "american-modern" => [0x78906c, 0x584a43, 0xa97b58],
        "coral-fantasy" => [0x4db5ad, 0x59606d, 0xf07b70],
        "ancient-greek" => [0x879b72, 0x70675a, 0xc6a15b],
        _ => [concept.palette[0], 0x665b56, concept.palette[2]],
    }
}

fn exterior_structure(
    habitat_form: &str,
    architecture_style: &str,
    concept: &TopiaGenerationConcept,
) -> Vec<TopiaObjectConfig> {
    let [wall, accent, roof, trim] = architecture_palette(architecture_style, concept);
    let [island_ground, island_rock, island_mineral] = island_palette(architecture_style, concept);
    let mut objects = vec![with_params(
        structure_object(
            "home-island",
            TopiaPrefab::FloatingIsland,
            [0.0, 0.0, 0.0],
            [1.0, 1.0, 0.78],
            vec![island_ground, island_rock, island_mineral],
        ),
        &[("radius", 3.5), ("depth", 1.9)],
    )];

    match habitat_form {
        "cloud-house" => objects.extend([
            structure_object(
                "cloud-house-core",
                TopiaPrefab::Cloud,
                [0.0, 1.42, 0.0],
                [3.4, 1.75, 2.25],
                vec![wall],
            ),
            structure_object(
                "cloud-house-left",
                TopiaPrefab::Cloud,
                [-1.9, 1.2, 0.1],
                [2.25, 1.3, 1.55],
                vec![wall],
            ),
            structure_object(
                "cloud-house-crown",
                TopiaPrefab::Cloud,
                [0.45, 2.28, -0.35],
                [1.8, 1.2, 1.35],
                vec![trim],
            ),
            with_anchor(
                structure_object(
                    "cloud-house-door",
                    TopiaPrefab::Door,
                    [0.7, 1.05, 1.48],
                    [1.0, 1.08, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "cloud-house-window",
                TopiaPrefab::RoundWindow,
                [-0.72, 1.58, 1.55],
                [1.25, 1.25, 1.25],
                vec![accent, roof],
            ),
            with_params(
                structure_object(
                    "cloud-house-chimney",
                    TopiaPrefab::Cylinder,
                    [-0.86, 2.45, -0.36],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("radiusTop", 0.2), ("radiusBottom", 0.28), ("height", 1.2)],
            ),
            structure_object(
                "cloud-house-observatory",
                TopiaPrefab::Observatory,
                [1.1, 2.58, -0.25],
                [1.35, 1.35, 1.35],
                vec![roof],
            ),
            with_params(
                structure_object(
                    "cloud-house-balcony",
                    TopiaPrefab::Path,
                    [0.0, 0.72, 1.65],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 3.2), ("depth", 0.7)],
            ),
        ]),
        "courtyard-compound" => objects.extend([
            with_params(
                structure_object(
                    "courtyard-rear-hall",
                    TopiaPrefab::Block,
                    [0.0, 0.92, -1.35],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 4.7), ("height", 1.5), ("depth", 0.5)],
            ),
            with_params(
                structure_object(
                    "courtyard-left-wing",
                    TopiaPrefab::Block,
                    [-2.18, 0.8, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 0.62), ("height", 1.3), ("depth", 2.45)],
            ),
            with_params(
                structure_object(
                    "courtyard-right-wing",
                    TopiaPrefab::Block,
                    [2.18, 0.8, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 0.62), ("height", 1.3), ("depth", 2.45)],
            ),
            with_params(
                structure_object(
                    "courtyard-gate-left",
                    TopiaPrefab::Block,
                    [-0.72, 1.15, 1.28],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 0.28), ("height", 2.05), ("depth", 0.38)],
            ),
            with_params(
                structure_object(
                    "courtyard-gate-right",
                    TopiaPrefab::Block,
                    [0.72, 1.15, 1.28],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 0.28), ("height", 2.05), ("depth", 0.38)],
            ),
            with_params(
                structure_object(
                    "courtyard-gate",
                    TopiaPrefab::Block,
                    [0.0, 2.12, 1.28],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 1.72), ("height", 0.28), ("depth", 0.42)],
            ),
            with_anchor(
                structure_object(
                    "courtyard-door",
                    TopiaPrefab::Door,
                    [0.0, 0.9, 1.52],
                    [1.0, 1.1, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "courtyard-main-roof",
                        TopiaPrefab::Cone,
                        [0.0, 1.93, -1.35],
                        [2.65, 0.38, 0.72],
                        vec![roof],
                    ),
                    [0.0, 0.0, 0.0],
                ),
                &[
                    ("radius", 1.0),
                    ("height", 1.0),
                    ("segments", 4.0),
                    ("gable", 1.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "courtyard-left-roof",
                        TopiaPrefab::Cone,
                        [-2.18, 1.6, 0.0],
                        [1.55, 0.34, 0.82],
                        vec![roof],
                    ),
                    [0.0, std::f64::consts::FRAC_PI_2, 0.0],
                ),
                &[
                    ("radius", 1.0),
                    ("height", 1.0),
                    ("segments", 4.0),
                    ("gable", 1.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "courtyard-right-roof",
                        TopiaPrefab::Cone,
                        [2.18, 1.6, 0.0],
                        [1.55, 0.34, 0.82],
                        vec![roof],
                    ),
                    [0.0, std::f64::consts::FRAC_PI_2, 0.0],
                ),
                &[
                    ("radius", 1.0),
                    ("height", 1.0),
                    ("segments", 4.0),
                    ("gable", 1.0),
                ],
            ),
            with_params(
                structure_object(
                    "courtyard-tree",
                    TopiaPrefab::Plant,
                    [0.0, 0.1, -0.05],
                    [1.15, 1.15, 1.15],
                    vec![trim, concept.palette[0]],
                ),
                &[("tree", 1.0)],
            ),
        ]),
        "cantilever-villa" => objects.extend([
            with_params(
                structure_object(
                    "villa-lower-slab",
                    TopiaPrefab::Block,
                    [-0.35, 0.95, 0.05],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 4.9), ("height", 0.72), ("depth", 2.15)],
            ),
            with_params(
                structure_object(
                    "villa-upper-volume",
                    TopiaPrefab::Block,
                    [0.95, 1.95, -0.35],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 4.15), ("height", 1.12), ("depth", 1.75)],
            ),
            with_params(
                structure_object(
                    "villa-glass-wall",
                    TopiaPrefab::Block,
                    [-1.05, 1.46, 1.16],
                    [1.0, 1.0, 1.0],
                    vec![accent],
                ),
                &[("width", 2.25), ("height", 1.35), ("depth", 0.14)],
            ),
            with_params(
                structure_object(
                    "villa-flat-roof",
                    TopiaPrefab::Block,
                    [0.95, 2.7, -0.35],
                    [1.0, 1.0, 1.0],
                    vec![roof],
                ),
                &[("width", 4.65), ("height", 0.16), ("depth", 2.15)],
            ),
            with_params(
                structure_object(
                    "villa-pillar-a",
                    TopiaPrefab::Cylinder,
                    [-1.65, 0.8, -0.45],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.12), ("radiusBottom", 0.12), ("height", 1.6)],
            ),
            with_params(
                structure_object(
                    "villa-pillar-b",
                    TopiaPrefab::Cylinder,
                    [1.9, 0.8, -0.45],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.12), ("radiusBottom", 0.12), ("height", 1.6)],
            ),
            with_anchor(
                structure_object(
                    "villa-door",
                    TopiaPrefab::Door,
                    [0.72, 1.02, 1.18],
                    [1.0, 1.0, 1.0],
                    vec![trim, roof, accent],
                ),
                "portal-interior",
            ),
            structure_object(
                "villa-round-window",
                TopiaPrefab::RoundWindow,
                [1.55, 2.05, 0.56],
                [0.95, 0.95, 0.95],
                vec![accent, trim],
            ),
            with_params(
                structure_object(
                    "villa-cantilever-deck",
                    TopiaPrefab::Path,
                    [-2.5, 1.0, 0.15],
                    [1.0, 1.0, 1.0],
                    vec![roof],
                ),
                &[("width", 2.2), ("depth", 1.25)],
            ),
        ]),
        "reef-grotto" => objects.extend([
            with_params(
                structure_object(
                    "reef-central-pod",
                    TopiaPrefab::Cylinder,
                    [0.0, 1.18, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.82),
                    ("radiusBottom", 1.38),
                    ("height", 2.25),
                    ("segments", 10.0),
                ],
            ),
            with_anchor(
                structure_object(
                    "reef-door",
                    TopiaPrefab::Door,
                    [0.0, 0.86, 1.18],
                    [1.0, 1.0, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "reef-window",
                TopiaPrefab::RoundWindow,
                [-0.15, 1.58, 1.02],
                [0.9, 0.9, 0.9],
                vec![accent, trim],
            ),
            structure_object(
                "reef-spire-a",
                TopiaPrefab::Crystal,
                [-1.6, 1.15, -0.2],
                [2.2, 3.5, 2.2],
                vec![accent],
            ),
            structure_object(
                "reef-spire-b",
                TopiaPrefab::Crystal,
                [1.55, 0.9, -0.7],
                [1.65, 2.8, 1.65],
                vec![roof],
            ),
            structure_object(
                "reef-spire-c",
                TopiaPrefab::Crystal,
                [2.2, 0.58, 0.7],
                [1.1, 1.9, 1.1],
                vec![trim],
            ),
            with_params(
                structure_object(
                    "reef-shell-tower",
                    TopiaPrefab::Tower,
                    [-1.1, 0.3, 0.75],
                    [0.85, 0.9, 0.85],
                    vec![wall, accent],
                ),
                &[("radius", 0.62), ("height", 1.75)],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "reef-arch",
                        TopiaPrefab::Cone,
                        [0.85, 1.75, -0.25],
                        [1.4, 1.6, 0.85],
                        vec![roof],
                    ),
                    [0.0, 0.45, 0.0],
                ),
                &[("radius", 0.72), ("height", 1.8), ("segments", 5.0)],
            ),
            structure_object(
                "reef-observatory",
                TopiaPrefab::Observatory,
                [0.0, 2.5, -0.2],
                [1.25, 1.25, 1.25],
                vec![trim],
            ),
        ]),
        "tower-village" => objects.extend([
            with_params(
                structure_object(
                    "village-tower-main",
                    TopiaPrefab::Tower,
                    [0.25, 0.25, 0.0],
                    [1.2, 1.25, 1.2],
                    vec![wall, roof],
                ),
                &[("radius", 0.82), ("height", 2.75)],
            ),
            with_params(
                structure_object(
                    "village-tower-left",
                    TopiaPrefab::Tower,
                    [-1.75, 0.2, -0.55],
                    [0.82, 0.9, 0.82],
                    vec![wall, accent],
                ),
                &[("radius", 0.72), ("height", 2.1)],
            ),
            with_params(
                structure_object(
                    "village-tower-right",
                    TopiaPrefab::Tower,
                    [1.9, 0.18, -0.72],
                    [0.72, 0.78, 0.72],
                    vec![wall, trim],
                ),
                &[("radius", 0.68), ("height", 1.9)],
            ),
            with_anchor(
                structure_object(
                    "village-door",
                    TopiaPrefab::Door,
                    [0.25, 0.92, 1.08],
                    [1.0, 1.0, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "village-window",
                TopiaPrefab::RoundWindow,
                [0.25, 1.8, 1.0],
                [0.88, 0.88, 0.88],
                vec![accent, trim],
            ),
            with_params(
                structure_object(
                    "village-bridge-left",
                    TopiaPrefab::Path,
                    [-0.85, 1.02, -0.35],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 1.8), ("depth", 0.38)],
            ),
            with_params(
                structure_object(
                    "village-bridge-right",
                    TopiaPrefab::Path,
                    [1.05, 0.92, -0.42],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 1.7), ("depth", 0.38)],
            ),
            structure_object(
                "village-observatory",
                TopiaPrefab::Observatory,
                [0.25, 3.45, 0.0],
                [1.1, 1.1, 1.1],
                vec![accent],
            ),
        ]),
        "stilt-lodge" => objects.extend([
            with_params(
                structure_object(
                    "lodge-stilt-a",
                    TopiaPrefab::Cylinder,
                    [-1.3, 1.0, -0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-stilt-b",
                    TopiaPrefab::Cylinder,
                    [1.3, 1.0, -0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-stilt-c",
                    TopiaPrefab::Cylinder,
                    [-1.3, 1.0, 0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-stilt-d",
                    TopiaPrefab::Cylinder,
                    [1.3, 1.0, 0.72],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("radiusTop", 0.13), ("radiusBottom", 0.18), ("height", 2.0)],
            ),
            with_params(
                structure_object(
                    "lodge-body",
                    TopiaPrefab::Block,
                    [0.0, 2.3, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 3.8), ("height", 1.5), ("depth", 2.15)],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "lodge-thatch-roof",
                        TopiaPrefab::Cone,
                        [0.0, 3.45, 0.0],
                        [2.4, 0.85, 1.55],
                        vec![roof],
                    ),
                    [0.0, 0.78, 0.0],
                ),
                &[("radius", 1.0), ("height", 1.35), ("segments", 4.0)],
            ),
            with_anchor(
                structure_object(
                    "lodge-door",
                    TopiaPrefab::Door,
                    [0.55, 2.12, 1.14],
                    [1.0, 1.0, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            structure_object(
                "lodge-window",
                TopiaPrefab::RoundWindow,
                [-0.72, 2.46, 1.12],
                [0.9, 0.9, 0.9],
                vec![accent, trim],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "lodge-ramp",
                        TopiaPrefab::Path,
                        [0.55, 1.18, 1.75],
                        [1.0, 1.0, 1.0],
                        vec![trim],
                    ),
                    [-0.42, 0.0, 0.0],
                ),
                &[("width", 0.72), ("depth", 2.2)],
            ),
        ]),
        "temple-terrace" => objects.extend([
            with_params(
                structure_object(
                    "temple-platform",
                    TopiaPrefab::Block,
                    [0.0, 0.52, 0.0],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 5.2), ("height", 0.55), ("depth", 3.1)],
            ),
            with_params(
                structure_object(
                    "temple-column-a",
                    TopiaPrefab::Cylinder,
                    [-1.55, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-column-b",
                    TopiaPrefab::Cylinder,
                    [-0.52, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-column-c",
                    TopiaPrefab::Cylinder,
                    [0.52, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-column-d",
                    TopiaPrefab::Cylinder,
                    [1.55, 1.55, 0.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[
                    ("radiusTop", 0.2),
                    ("radiusBottom", 0.27),
                    ("height", 2.35),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                structure_object(
                    "temple-entablature",
                    TopiaPrefab::Block,
                    [0.0, 2.8, 0.25],
                    [1.0, 1.0, 1.0],
                    vec![trim],
                ),
                &[("width", 4.25), ("height", 0.3), ("depth", 1.8)],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "temple-pediment",
                        TopiaPrefab::Cone,
                        [0.0, 3.35, 0.25],
                        [2.35, 0.75, 1.25],
                        vec![roof],
                    ),
                    [0.0, 0.0, 0.0],
                ),
                &[("radius", 1.0), ("height", 1.1), ("segments", 3.0)],
            ),
            with_anchor(
                structure_object(
                    "temple-door",
                    TopiaPrefab::Door,
                    [0.0, 1.18, -0.28],
                    [1.0, 1.15, 1.0],
                    vec![accent, roof, trim],
                ),
                "portal-interior",
            ),
            with_params(
                structure_object(
                    "temple-stairs",
                    TopiaPrefab::Path,
                    [0.0, 0.78, 1.75],
                    [1.0, 1.0, 1.0],
                    vec![wall],
                ),
                &[("width", 2.0), ("depth", 1.15)],
            ),
        ]),
        _ => objects.extend([
            with_params(
                with_rotation(
                    structure_object(
                        "capsule-main",
                        TopiaPrefab::Cylinder,
                        [0.0, 1.45, 0.0],
                        [1.0, 1.0, 1.0],
                        vec![wall],
                    ),
                    [0.0, 0.0, std::f64::consts::FRAC_PI_2],
                ),
                &[
                    ("radiusTop", 0.92),
                    ("radiusBottom", 0.92),
                    ("height", 3.9),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "capsule-pod-left",
                        TopiaPrefab::Cylinder,
                        [-1.85, 1.05, -0.7],
                        [0.72, 0.72, 0.72],
                        vec![accent],
                    ),
                    [0.0, 0.0, std::f64::consts::FRAC_PI_2],
                ),
                &[
                    ("radiusTop", 0.78),
                    ("radiusBottom", 0.78),
                    ("height", 2.2),
                    ("segments", 12.0),
                ],
            ),
            with_params(
                with_rotation(
                    structure_object(
                        "capsule-pod-right",
                        TopiaPrefab::Cylinder,
                        [1.85, 1.05, -0.55],
                        [0.72, 0.72, 0.72],
                        vec![roof],
                    ),
                    [0.0, 0.0, std::f64::consts::FRAC_PI_2],
                ),
                &[
                    ("radiusTop", 0.78),
                    ("radiusBottom", 0.78),
                    ("height", 2.2),
                    ("segments", 12.0),
                ],
            ),
            with_anchor(
                structure_object(
                    "capsule-door",
                    TopiaPrefab::Door,
                    [0.4, 1.0, 0.96],
                    [0.9, 1.0, 0.9],
                    vec![accent, trim, roof],
                ),
                "portal-interior",
            ),
            structure_object(
                "capsule-window-left",
                TopiaPrefab::RoundWindow,
                [-0.72, 1.52, 0.88],
                [0.9, 0.9, 0.9],
                vec![accent, trim],
            ),
            structure_object(
                "capsule-window-right",
                TopiaPrefab::RoundWindow,
                [1.45, 1.25, 0.54],
                [0.7, 0.7, 0.7],
                vec![accent, trim],
            ),
            structure_object(
                "capsule-propeller",
                TopiaPrefab::Propeller,
                [-2.85, 1.4, -0.7],
                [1.25, 1.25, 1.25],
                vec![roof, accent],
            ),
            structure_object(
                "capsule-observatory",
                TopiaPrefab::Observatory,
                [0.0, 2.35, 0.0],
                [1.2, 1.2, 1.2],
                vec![accent],
            ),
        ]),
    }

    objects.push(with_anchor(
        with_params(
            structure_object(
                "garden-portal-island",
                TopiaPrefab::FloatingIsland,
                [-5.8, 1.05, -3.5],
                [0.52, 0.52, 0.42],
                vec![accent, trim, roof],
            ),
            &[("radius", 2.15), ("depth", 1.4)],
        ),
        "portal-garden",
    ));
    objects
}

pub(super) fn diversify_fallback_exterior(
    scene: &mut TopiaSceneConfig,
    concept: &TopiaGenerationConcept,
) {
    let bias = concept
        .title
        .bytes()
        .chain(concept.archetype.bytes())
        .fold(0_u64, |hash, byte| {
            hash.wrapping_mul(31).wrapping_add(byte as u64)
        });
    let habitat_forms = [
        "cloud-house",
        "courtyard-compound",
        "cantilever-villa",
        "reef-grotto",
        "tower-village",
        "stilt-lodge",
        "temple-terrace",
        "wandering-capsule",
    ];
    let architecture_styles = [
        "cloud-organic",
        "cycladic-white",
        "chinese-thatch",
        "chinese-red-wall",
        "jiangnan-white-wall",
        "american-modern",
        "coral-fantasy",
        "ancient-greek",
    ];
    scene
        .objects
        .retain(|object| object.layer == TopiaObjectLayer::Decoration);
    scene.landmarks.clear();
    scene.objects.extend(exterior_structure(
        habitat_forms[bias as usize % habitat_forms.len()],
        architecture_styles[(bias >> 7) as usize % architecture_styles.len()],
        concept,
    ));
}

fn apply_layout(
    scene: &mut TopiaSceneConfig,
    location: TopiaLocation,
    layout: &str,
    silhouette_bias: u64,
) {
    if location == TopiaLocation::Exterior {
        return;
    }
    for (index, object) in scene
        .objects
        .iter_mut()
        .filter(|object| {
            object.layer == TopiaObjectLayer::Structure
                && object.prefab != TopiaPrefab::RoomShell
                && object.prefab != TopiaPrefab::FloatingIsland
        })
        .enumerate()
    {
        let phase = index as f64 * 1.73 + (silhouette_bias % 31) as f64 / 10.0;
        match layout {
            "ring" | "courtyard" => {
                let radius = if location == TopiaLocation::Interior {
                    2.25
                } else {
                    2.8
                };
                object.position[0] = phase.cos() * radius;
                object.position[2] = phase.sin() * radius;
            }
            "vertical" => {
                object.position[0] = if index % 2 == 0 { -1.25 } else { 1.25 };
                object.position[1] += (index % 3) as f64 * 0.42;
                object.position[2] = -1.4 + (index % 4) as f64 * 0.9;
            }
            "cantilevered" => {
                object.position[0] = -2.6 + (index % 5) as f64 * 1.25;
                object.position[1] += (index % 2) as f64 * 0.3;
                object.position[2] = if index % 2 == 0 { -1.35 } else { 1.15 };
            }
            "terraced" => {
                object.position[0] = -2.7 + (index % 5) as f64 * 1.3;
                object.position[1] += (index % 3) as f64 * 0.24;
                object.position[2] = -1.35 + (index / 3) as f64 * 0.72;
            }
            "linear" => {
                object.position[0] = -2.7 + (index % 7) as f64 * 0.9;
                object.position[2] = if index % 2 == 0 { -1.1 } else { 1.05 };
            }
            _ => {
                object.position[0] *= 0.78 + (index % 3) as f64 * 0.16;
                object.position[2] *= 0.72 + (index % 2) as f64 * 0.24;
            }
        }
    }
}

fn interior_shape(habitat_form: &str) -> &'static str {
    match habitat_form {
        "temple-terrace" => "terraced-apse",
        "cloud-house" => "cloud-ring",
        "stilt-lodge" => "terraced-loft",
        "courtyard-compound" => "courtyard-ring",
        "cantilever-villa" => "cantilever-loft",
        "reef-grotto" => "crystal-grotto",
        _ => "cloud-ring",
    }
}

fn apply_interior_form(
    scene: &mut TopiaSceneConfig,
    habitat_form: &str,
    architecture_style: &str,
    layout: &str,
    silhouette_bias: u64,
    concept: &TopiaGenerationConcept,
) {
    apply_layout(scene, TopiaLocation::Interior, layout, silhouette_bias);
    let shape = interior_shape(habitat_form);
    let [wall, frame, accent, floor] = architecture_palette(architecture_style, concept);
    for object in &mut scene.objects {
        if object.prefab == TopiaPrefab::RoomShell {
            object.colors = vec![floor, wall, accent, frame];
            object
                .params
                .insert("shape".into(), Value::String(shape.into()));
            object.params.insert(
                "spatialType".into(),
                Value::String(
                    if shape.contains("loft") {
                        "loft"
                    } else if shape == "courtyard-ring" {
                        "courtyard"
                    } else {
                        "single-level"
                    }
                    .into(),
                ),
            );
            object.scale = Some([1.0, 1.0, 1.0]);
            continue;
        }

        let placement = match (shape, object.id.as_str()) {
            ("terraced-apse", "room-window") => Some(([0.8, 2.15, -2.18], 0.0)),
            ("terraced-apse", "bed") => Some(([1.9, 0.55, 1.15], -0.08)),
            ("terraced-apse", "nightstand") => Some(([0.7, 0.55, 1.3], 0.0)),
            ("terraced-apse", "star-map-desk-object") => Some(([-1.55, 1.5, -0.85], 0.08)),
            ("terraced-apse", "desk-chair") => Some(([-1.4, 0.65, 0.1], 0.08)),
            ("terraced-apse", "album-shelf-object") => Some(([-2.45, 1.62, -0.65], -0.08)),
            ("terraced-apse", "window-garden-object") => Some(([2.45, 0.42, -1.0], 0.0)),
            ("terraced-apse", "hearth") => Some(([-2.2, 0.78, 1.15], 0.05)),
            ("terraced-apse", "room-rug") => Some(([0.0, 0.58, 0.2], 0.0)),
            ("terraced-apse", "room-lantern") => Some(([0.0, 2.4, -0.2], 0.0)),
            ("terraced-apse", "room-propeller") => Some(([2.75, 0.95, 0.15], 0.0)),

            ("cloud-ring", "room-window") => Some(([0.8, 1.95, -2.15], 0.08)),
            ("cloud-ring", "bed") => Some(([1.6, 0.18, 0.85], -0.18)),
            ("cloud-ring", "nightstand") => Some(([0.35, 0.22, 1.45], 0.0)),
            ("cloud-ring", "star-map-desk-object") => Some(([-1.55, 1.02, -1.25], 0.22)),
            ("cloud-ring", "desk-chair") => Some(([-1.55, 0.25, -0.25], 0.22)),
            ("cloud-ring", "album-shelf-object") => Some(([-2.45, 1.25, -0.65], -0.38)),
            ("cloud-ring", "window-garden-object") => Some(([2.4, 0.08, -0.9], 0.0)),
            ("cloud-ring", "hearth") => Some(([-2.2, 0.47, 1.25], 0.28)),
            ("cloud-ring", "room-rug") => Some(([0.0, 0.04, 0.15], 0.0)),
            ("cloud-ring", "room-lantern") => Some(([0.0, 2.05, -0.3], 0.0)),
            ("cloud-ring", "room-propeller") => Some(([2.75, 0.68, 0.4], 0.0)),

            ("terraced-loft", "room-window") => Some(([1.25, 2.65, -1.9], 0.08)),
            ("terraced-loft", "bed") => Some(([1.75, 0.18, 0.95], -0.08)),
            ("terraced-loft", "nightstand") => Some(([0.45, 0.22, 1.25], 0.0)),
            ("terraced-loft", "star-map-desk-object") => Some(([-1.4, 2.65, -1.1], 0.0)),
            ("terraced-loft", "desk-chair") => Some(([-1.35, 1.9, -0.15], 0.0)),
            ("terraced-loft", "album-shelf-object") => Some(([-2.45, 2.8, -0.75], -0.08)),
            ("terraced-loft", "window-garden-object") => Some(([2.3, 0.08, -1.25], 0.0)),
            ("terraced-loft", "hearth") => Some(([2.35, 0.47, 0.85], 0.0)),
            ("terraced-loft", "room-rug") => Some(([0.0, 0.04, 0.35], 0.0)),
            ("terraced-loft", "room-lantern") => Some(([-0.2, 3.15, -0.4], 0.0)),
            ("terraced-loft", "room-propeller") => Some(([2.85, 0.75, -0.25], 0.0)),

            ("courtyard-ring", "room-window") => Some(([2.05, 1.75, -2.09], 0.0)),
            ("courtyard-ring", "bed") => Some(([2.0, 0.18, 0.9], 0.05)),
            ("courtyard-ring", "nightstand") => Some(([2.55, 0.22, 0.0], 0.0)),
            ("courtyard-ring", "star-map-desk-object") => Some(([-2.0, 1.02, -0.85], 0.0)),
            ("courtyard-ring", "desk-chair") => Some(([-2.0, 0.25, 0.1], 0.0)),
            ("courtyard-ring", "album-shelf-object") => Some(([-2.75, 1.25, 0.8], 0.0)),
            ("courtyard-ring", "window-garden-object") => Some(([0.0, 0.3, 0.0], 0.0)),
            ("courtyard-ring", "hearth") => Some(([0.0, 0.47, -1.55], 0.0)),
            ("courtyard-ring", "room-rug") => Some(([0.0, 0.04, 1.55], 0.0)),
            ("courtyard-ring", "room-lantern") => Some(([0.0, 2.2, 0.0], 0.0)),
            ("courtyard-ring", "room-propeller") => Some(([2.75, 0.68, -0.7], 0.0)),

            ("cantilever-loft", "room-window") => Some(([1.2, 2.85, -2.08], 0.0)),
            ("cantilever-loft", "bed") => Some(([1.55, 1.88, -0.85], 0.0)),
            ("cantilever-loft", "nightstand") => Some(([2.65, 1.92, -0.7], 0.0)),
            ("cantilever-loft", "star-map-desk-object") => Some(([-1.65, 1.02, -1.05], 0.0)),
            ("cantilever-loft", "desk-chair") => Some(([-1.5, 0.25, -0.05], 0.0)),
            ("cantilever-loft", "album-shelf-object") => Some(([-2.65, 1.25, -0.65], 0.0)),
            ("cantilever-loft", "window-garden-object") => Some(([0.25, 1.58, -1.4], 0.0)),
            ("cantilever-loft", "hearth") => Some(([-2.2, 0.47, 1.1], 0.0)),
            ("cantilever-loft", "room-rug") => Some(([-0.3, 0.04, 0.7], 0.0)),
            ("cantilever-loft", "room-lantern") => Some(([1.4, 3.3, -0.8], 0.0)),
            ("cantilever-loft", "room-propeller") => Some(([2.85, 2.25, -0.65], 0.0)),

            ("crystal-grotto", "room-window") => Some(([1.65, 2.1, -1.85], 0.25)),
            ("crystal-grotto", "bed") => Some(([1.95, 0.58, 0.85], -0.18)),
            ("crystal-grotto", "nightstand") => Some(([1.1, 0.55, 1.3], 0.0)),
            ("crystal-grotto", "star-map-desk-object") => Some(([-2.15, 1.35, 0.6], 0.55)),
            ("crystal-grotto", "desk-chair") => Some(([-1.4, 0.58, 0.2], 0.55)),
            ("crystal-grotto", "album-shelf-object") => Some(([-2.5, 1.45, -0.7], -0.6)),
            ("crystal-grotto", "window-garden-object") => Some(([2.45, 0.2, -0.55], 0.0)),
            ("crystal-grotto", "hearth") => Some(([-0.3, 0.7, 1.55], 0.0)),
            ("crystal-grotto", "room-rug") => Some(([0.25, 0.04, 0.75], 0.0)),
            ("crystal-grotto", "room-lantern") => Some(([0.0, 2.55, -0.45], 0.0)),
            ("crystal-grotto", "room-propeller") => Some(([2.85, 0.8, 0.1], 0.0)),
            _ => None,
        };
        if let Some((position, rotation_y)) = placement {
            object.position = position;
            object.rotation = Some([0.0, rotation_y, 0.0]);
        }
    }
}

fn feature_position(
    layout: &str,
    index: usize,
    angle: f64,
    radius: f64,
    base_y: f64,
    emphasis: f64,
) -> [f64; 3] {
    match layout {
        "ring" | "courtyard" => [angle.cos() * 2.65, base_y + emphasis, angle.sin() * 2.65],
        "vertical" => [
            if index % 2 == 0 { -1.1 } else { 1.1 },
            base_y + emphasis + index as f64 * 0.42,
            -0.65 + (index % 3) as f64 * 0.65,
        ],
        "cantilevered" => [
            -2.55 + index as f64 * 1.08,
            base_y + emphasis + (index % 2) as f64 * 0.34,
            if index % 2 == 0 { -1.45 } else { 1.25 },
        ],
        "terraced" => [
            -2.6 + index as f64 * 1.05,
            base_y + emphasis + (index % 3) as f64 * 0.28,
            -1.25 + (index / 2) as f64 * 0.68,
        ],
        "linear" => [
            -2.5 + index as f64,
            base_y + emphasis,
            if index % 2 == 0 { -1.15 } else { 1.05 },
        ],
        _ => [
            angle.cos() * radius,
            base_y + emphasis,
            angle.sin() * radius,
        ],
    }
}

fn bounded(value: f64, low: f64, high: f64, default: f64) -> f64 {
    if value.is_finite() {
        value.clamp(low, high)
    } else {
        default
    }
}

fn apply_spatial_blueprint(
    scene: &mut TopiaSceneConfig,
    location: TopiaLocation,
    b: &SceneBlueprint,
    concept: &TopiaGenerationConcept,
) {
    let aspect = bounded(b.island_aspect.unwrap_or(1.0), 0.65, 1.45, 1.0);
    let shape = selected_token(
        &b.island_shape,
        &[
            "oval",
            "crescent",
            "split",
            "elongated",
            "terraced",
            "hexagonal",
        ],
        0,
    );
    let islands: Vec<_> = scene
        .objects
        .iter_mut()
        .filter(|o| o.prefab == TopiaPrefab::FloatingIsland && o.anchor_id.is_none())
        .collect();
    for island in islands {
        island.scale = Some([aspect, 1.0, 1.0 / aspect]);
        island
            .params
            .insert("shape".into(), Value::String(shape.into()));
        island.params.insert(
            "radius".into(),
            Value::from(if location == TopiaLocation::Garden {
                5.2
            } else {
                4.8
            }),
        );
        island.params.insert(
            "depth".into(),
            Value::from(bounded(b.island_depth.unwrap_or(1.9), 0.9, 2.8, 1.9)),
        );
    }
    if shape == "split" && location != TopiaLocation::Interior {
        for (i, x) in [-2.7, 2.7].into_iter().enumerate() {
            scene.objects.push(with_params(
                structure_object(
                    &format!("connected-islet-{i}"),
                    TopiaPrefab::FloatingIsland,
                    [x, -0.1, -0.4],
                    [1.0, 1.0, 0.8],
                    vec![concept.palette[0], 0x75657f, concept.palette[2]],
                ),
                &[("radius", 1.5), ("depth", 1.25)],
            ));
            scene.objects.push(with_params(
                structure_object(
                    &format!("islet-bridge-{i}"),
                    TopiaPrefab::Block,
                    [x / 2.0, 0.18, -0.4],
                    [1.0; 3],
                    vec![concept.palette[1]],
                ),
                &[("width", 2.0), ("height", 0.12), ("depth", 0.55)],
            ));
        }
    }
    if location == TopiaLocation::Exterior && !b.massing.is_empty() {
        // The model owns the structural composition, not only a template selector.
        scene.objects.retain(|o| {
            o.layer != TopiaObjectLayer::Structure
                || matches!(
                    o.prefab,
                    TopiaPrefab::FloatingIsland | TopiaPrefab::Door | TopiaPrefab::RoundWindow
                )
                || o.id.starts_with("islet-bridge")
        });
        for (i, mass) in b.massing.iter().take(7).enumerate() {
            let prefab = match mass.kind.as_str() {
                "block" => TopiaPrefab::Block,
                "cylinder" => TopiaPrefab::Cylinder,
                "cone" => TopiaPrefab::Cone,
                "cloud" => TopiaPrefab::Cloud,
                "crystal" => TopiaPrefab::Crystal,
                "tower" => TopiaPrefab::Tower,
                _ => continue,
            };
            let size = [
                bounded(mass.size[0], 0.3, 3.6, 1.0),
                bounded(mass.size[1], 0.4, 3.6, 1.5),
                bounded(mass.size[2], 0.3, 2.8, 1.0),
            ];
            let mut o = structure_object(
                &format!("designed-mass-{i}"),
                prefab,
                [
                    bounded(mass.position[0], -2.1, 2.1, 0.0),
                    0.2 + size[1] / 2.0,
                    bounded(mass.position[1], -1.8, 1.8, 0.0),
                ],
                [1.0; 3],
                vec![concept.palette[i % 3], concept.palette[(i + 1) % 3]],
            );
            if matches!(
                prefab,
                TopiaPrefab::Block | TopiaPrefab::Cylinder | TopiaPrefab::Cone
            ) {
                o = with_params(
                    o,
                    &[
                        ("width", size[0]),
                        ("height", size[1]),
                        ("depth", size[2]),
                        ("radius", size[0] / 2.0),
                        ("radiusTop", size[0] / 2.0),
                        ("radiusBottom", size[0] / 2.0),
                    ],
                );
            } else {
                o.scale = Some(size);
            }
            o.rotation = Some([0.0, bounded(mass.rotation, -3.2, 3.2, 0.0), 0.0]);
            if let Some(parent) = mass
                .support
                .filter(|p| *p < i)
                .and_then(|p| {
                    scene
                        .objects
                        .iter()
                        .find(|o| o.id == format!("designed-mass-{p}"))
                })
                .filter(|parent| {
                    let h = parent
                        .params
                        .get("height")
                        .and_then(Value::as_f64)
                        .unwrap_or(parent.scale.unwrap_or([1.0; 3])[1]);
                    parent.position[1] + h / 2.0 + size[1] <= 7.0
                })
            {
                let parent_height = parent
                    .params
                    .get("height")
                    .and_then(Value::as_f64)
                    .unwrap_or(parent.scale.unwrap_or([1.0; 3])[1]);
                o.position[0] =
                    parent.position[0] + (o.position[0] - parent.position[0]).clamp(-0.35, 0.35);
                o.position[2] =
                    parent.position[2] + (o.position[2] - parent.position[2]).clamp(-0.35, 0.35);
                o.position[1] = parent.position[1] + parent_height / 2.0 + size[1] / 2.0;
                o.params
                    .insert("supportObject".into(), Value::String(parent.id.clone()));
            }
            scene.objects.push(o);
        }
        // Keep navigation attached to the foremost designed volume.
        if let Some(mass) = scene
            .objects
            .iter()
            .find(|o| o.id == "designed-mass-0")
            .cloned()
        {
            for door in scene
                .objects
                .iter_mut()
                .filter(|o| o.prefab == TopiaPrefab::Door)
            {
                door.position = [
                    mass.position[0],
                    0.92,
                    mass.position[2]
                        + mass
                            .params
                            .get("depth")
                            .and_then(Value::as_f64)
                            .unwrap_or(1.4)
                            / 2.0
                        + 0.035,
                ];
                door.rotation = None;
            }
        }
    }
    if location == TopiaLocation::Interior {
        let room_shape = selected_token(&b.room_shape, &["rectangular", "terraced-loft"], 0);
        let scale = b.room_scale.unwrap_or([1.3, 1.3]);
        let sx = bounded(scale[0], 1.1, 1.5, 1.3);
        let sz = bounded(scale[1], 1.1, 1.5, 1.3);
        if let Some(shell) = scene
            .objects
            .iter_mut()
            .find(|o| o.prefab == TopiaPrefab::RoomShell)
        {
            if !b.room_shape.is_empty() {
                shell
                    .params
                    .insert("shape".into(), Value::String(room_shape.into()));
            }
            shell.scale = Some([sx, 1.0, sz]);
        }
        for o in &mut scene.objects {
            if o.prefab != TopiaPrefab::RoomShell {
                o.position[0] *= sx;
                o.position[2] *= sz;
            }
        }
        for placement in b.furnishings.iter().take(8) {
            // Reuse IDs/relations but honor the model's functional zones.
            let kind =
                serde_json::from_value::<TopiaPrefab>(Value::String(placement.kind.clone())).ok();
            if let Some(o) = scene.objects.iter_mut().find(|o| {
                Some(o.prefab) == kind
                    && o.layer == TopiaObjectLayer::Structure
                    && o.prefab != TopiaPrefab::RoomShell
            }) {
                o.position[0] = bounded(placement.position[0], -2.5, 2.5, 0.0) * sx;
                o.position[2] = bounded(placement.position[1], -1.6, 1.6, 0.0) * sz;
                o.rotation = Some([0.0, bounded(placement.rotation, -3.2, 3.2, 0.0), 0.0]);
                let scale = bounded(placement.scale.unwrap_or(1.0), 0.65, 1.1, 1.0);
                o.scale = Some([scale; 3]);
            }
        }
    }
    if location == TopiaLocation::Garden {
        let mut plots = b.plots.iter().take(5).copied().collect::<Vec<_>>();
        if plots.is_empty() {
            plots = match b.layout.as_str() {
                "ring" | "courtyard" => (0..4)
                    .map(|i| {
                        let a = i as f64 * 1.57;
                        [a.cos() * 2.0, a.sin() * 2.0]
                    })
                    .collect(),
                "terraced" | "vertical" => vec![[-1.9, -1.2], [0.0, 0.0], [1.9, 1.2]],
                "linear" => vec![[-2.0, 0.0], [0.0, 0.0], [2.0, 0.0]],
                _ => vec![[-1.7, -1.0], [1.7, -1.0], [0.0, 1.35]],
            };
        }
        for (i, p) in plots.iter().enumerate() {
            let h = if matches!(b.layout.as_str(), "terraced" | "vertical") {
                0.18 + i as f64 * 0.2
            } else {
                0.18
            };
            scene.objects.push(with_params(
                structure_object(
                    &format!("garden-bed-pad-{i}"),
                    TopiaPrefab::Block,
                    [
                        bounded(p[0], -2.3, 2.3, 0.0) * aspect,
                        h / 2.0 + 0.17,
                        bounded(p[1], -2.0, 2.0, 0.0) / aspect,
                    ],
                    [1.0; 3],
                    vec![concept.palette[1], 0x76513f],
                ),
                &[("width", 1.65), ("height", h), ("depth", 1.4)],
            ));
        }
        fit_crop_slots(scene);
    }
}

/// A room is a residence first. Symbolic assets never count as usable furniture.
pub fn enforce_residential_room(scene: &mut TopiaSceneConfig, concept: &TopiaGenerationConcept) {
    let mut room_scale = [1.3, 1.3];
    if let Some(shell) = scene
        .objects
        .iter_mut()
        .find(|o| o.prefab == TopiaPrefab::RoomShell)
    {
        let shape = if shell.params.get("shape").and_then(Value::as_str) == Some("terraced-loft") {
            "terraced-loft"
        } else {
            "rectangular"
        };
        shell
            .params
            .insert("shape".into(), Value::String(shape.into()));
        shell.params.insert("residential".into(), Value::Bool(true));
        shell
            .params
            .insert("maxSouvenirExhibits".into(), Value::from(3));
        let s = shell.scale.unwrap_or([1.3, 1.0, 1.3]);
        room_scale = [bounded(s[0], 1.1, 1.5, 1.3), bounded(s[2], 1.1, 1.5, 1.3)];
        shell.scale = Some([room_scale[0], 1.0, room_scale[1]]);
    }
    let [sx, sz] = room_scale;
    for (kind, id, p) in [
        (TopiaPrefab::Bed, "room-bed", [-1.5 * sx, 0.2, 0.9 * sz]),
        (
            TopiaPrefab::Desk,
            "room-work-desk",
            [1.5 * sx, 1.0, -1.0 * sz],
        ),
        (
            TopiaPrefab::Chair,
            "room-work-chair",
            [1.5 * sx, 0.3, 0.15 * sz],
        ),
        (TopiaPrefab::Shelf, "room-storage", [0.0, 1.1, -1.8 * sz]),
    ] {
        if !scene.objects.iter().any(|o| {
            o.prefab == kind
                && o.layer == TopiaObjectLayer::Structure
                && o.params.get("detailKind").is_none()
        }) {
            scene.objects.push(structure_object(
                id,
                kind,
                p,
                [0.9; 3],
                concept.palette.to_vec(),
            ));
        }
    }
    let side = scene
        .objects
        .iter()
        .find(|o| o.prefab == TopiaPrefab::Bed && o.layer == TopiaObjectLayer::Structure)
        .map(|o| if o.position[0] < 0.0 { -1.0 } else { 1.0 })
        .unwrap_or(-1.0);
    let mut desk_position = [0.0; 3];
    for o in &mut scene.objects {
        if o.layer != TopiaObjectLayer::Structure {
            continue;
        }
        let role = match o.prefab {
            TopiaPrefab::Bed => {
                o.position[0] = side * bounded(o.position[0].abs() / sx, 1.3, 1.6, 1.5) * sx;
                o.position[2] = bounded(o.position[2] / sz, 0.7, 1.0, 0.9) * sz;
                o.rotation = Some([
                    0.0,
                    bounded(o.rotation.unwrap_or([0.0; 3])[1], -0.2, 0.2, 0.0),
                    0.0,
                ]);
                "sleep"
            }
            TopiaPrefab::Desk => {
                o.position[0] = -side * bounded(o.position[0].abs() / sx, 1.3, 1.7, 1.5) * sx;
                o.position[2] = bounded(o.position[2] / sz, -1.2, -0.8, -1.0) * sz;
                o.rotation = Some([0.0, 0.0, 0.0]);
                desk_position = o.position;
                "work"
            }
            TopiaPrefab::Shelf if o.params.get("detailKind").is_none() => {
                o.position[0] = bounded(o.position[0] / sx, -0.2, 0.2, 0.0) * sx;
                o.position[2] = -1.8 * sz;
                o.rotation = Some([0.0, std::f64::consts::FRAC_PI_2, 0.0]);
                "storage"
            }
            TopiaPrefab::Nightstand => {
                o.position[0] = side * 2.6 * sx;
                o.position[2] = 1.2 * sz;
                "sleep"
            }
            _ => continue,
        };
        o.params
            .insert("roomFunction".into(), Value::String(role.into()));
        o.scale = Some([bounded(o.scale.unwrap_or([0.9; 3])[0], 0.85, 1.0, 0.9); 3]);
        if o.animation.as_deref() == Some("float") {
            o.animation = None;
        }
    }
    for o in &mut scene.objects {
        if o.prefab == TopiaPrefab::Chair && o.layer == TopiaObjectLayer::Structure {
            o.position = [desk_position[0], 0.3, desk_position[2] + 1.12 * sz];
            o.rotation = Some([0.0, 0.0, 0.0]);
            o.params
                .insert("roomFunction".into(), Value::String("work".into()));
        }
        if o.id == "room-window" {
            o.position = [sx, 1.9, -2.05 * sz];
            o.rotation = Some([0.0; 3]);
            o.scale = Some([0.75; 3]);
        }
    }
    if !scene.objects.iter().any(|o| o.id == "room-entry-door") {
        scene.objects.push(structure_object(
            "room-entry-door",
            TopiaPrefab::Door,
            [0.0, 1.1, 2.1 * sz],
            [0.8; 3],
            concept.palette.to_vec(),
        ));
    }
    if !scene.objects.iter().any(|o| o.id == "room-display-cabinet") {
        let mut cabinet = structure_object(
            "room-display-cabinet",
            TopiaPrefab::Shelf,
            [side * 2.5 * sx, 0.2, -0.85 * sz],
            [1.0; 3],
            concept.palette.to_vec(),
        );
        cabinet.rotation = Some([0.0, std::f64::consts::FRAC_PI_2, 0.0]);
        cabinet
            .params
            .insert("detailKind".into(), Value::String("display-cabinet".into()));
        cabinet
            .params
            .insert("roomFunction".into(), Value::String("display".into()));
        scene.objects.push(cabinet);
    }
    for o in &mut scene.objects {
        if o.id == "room-entry-door" {
            o.position = [0.0, 1.1, 2.1 * sz];
            o.rotation = None;
        }
        if o.id == "room-display-cabinet" {
            o.position = [side * 2.5 * sx, 0.2, -0.85 * sz];
            o.rotation = Some([0.0, std::f64::consts::FRAC_PI_2, 0.0]);
            o.scale = Some([1.0; 3]);
        }
    }
}

pub fn fit_crop_slots(scene: &mut TopiaSceneConfig) {
    let slots: Vec<_> = scene
        .objects
        .iter()
        .filter(|o| o.id.starts_with("garden-bed-pad-"))
        .map(|o| {
            (
                [
                    o.position[0],
                    o.position[1]
                        + o.params
                            .get("height")
                            .and_then(Value::as_f64)
                            .unwrap_or(0.18)
                            / 2.0
                        + 0.08,
                    o.position[2],
                ],
                o.rotation,
            )
        })
        .collect();
    if slots.is_empty() {
        return;
    }
    let count = scene
        .objects
        .iter()
        .filter(|o| o.prefab == TopiaPrefab::CropPlot)
        .count();
    let per_bed = count.div_ceil(slots.len());
    let columns = (per_bed as f64).sqrt().ceil().max(1.0) as usize;
    for (i, crop) in scene
        .objects
        .iter_mut()
        .filter(|o| o.prefab == TopiaPrefab::CropPlot)
        .enumerate()
    {
        let (p, r) = slots[i % slots.len()];
        let cell = i / slots.len();
        let rows = per_bed.div_ceil(columns);
        crop.position = [
            p[0] + (cell % columns) as f64 * 1.55 / columns as f64
                - (columns - 1) as f64 * 0.775 / columns as f64,
            p[1],
            p[2] + (cell / columns) as f64 * 1.3 / rows as f64
                - (rows - 1) as f64 * 0.65 / rows as f64,
        ];
        crop.rotation = r;
        crop.scale = Some([0.9 / columns as f64; 3]);
        crop.animation = None;
    }
}

pub fn blueprint_position_normalizations(value: &str) -> usize {
    let Ok(compact) = extract_json(value) else {
        return 0;
    };
    ["massing", "furnishings"]
        .iter()
        .filter_map(|field| compact.get(field).and_then(Value::as_array))
        .flatten()
        .filter(|item| {
            item.get("position")
                .and_then(Value::as_array)
                .is_some_and(|p| p.len() == 3 && p.iter().all(Value::is_number))
        })
        .count()
}

pub fn compile_blueprint(
    value: &str,
    location: TopiaLocation,
    concept: &TopiaGenerationConcept,
) -> Result<TopiaSceneConfig, String> {
    let mut compact = extract_json(value)?;
    // Observed cloud output sometimes uses [x,y,z] despite the compact [x,z]
    // contract. Height is compiler-owned: keep x/z instead of retrying an
    // otherwise valid architecture or accepting a floating model-supplied y.
    for field in ["massing", "furnishings"] {
        if let Some(items) = compact.get_mut(field).and_then(Value::as_array_mut) {
            for item in items {
                if let Some(p) = item.get_mut("position").and_then(Value::as_array_mut) {
                    if p.len() == 3 && p.iter().all(Value::is_number) {
                        p.remove(1);
                    }
                }
            }
        }
    }
    let blueprint: SceneBlueprint =
        serde_json::from_value(compact).map_err(|error| error.to_string())?;
    let mut scene = fallback_scene(location, concept)?;
    if let Some(yaw) = blueprint.camera_yaw {
        scene.camera.yaw = yaw;
    }
    if let Some(pitch) = blueprint.camera_pitch {
        scene.camera.pitch = pitch;
    }

    let density = if blueprint.density.is_finite() {
        blueprint.density.clamp(0.0, 1.0)
    } else {
        default_density()
    };
    let silhouette_bias = blueprint.silhouette.bytes().fold(0_u64, |hash, byte| {
        hash.wrapping_mul(31).wrapping_add(byte as u64)
    });
    let habitat_form = selected_token(
        &blueprint.habitat_form,
        &[
            "cloud-house",
            "courtyard-compound",
            "cantilever-villa",
            "reef-grotto",
            "tower-village",
            "stilt-lodge",
            "temple-terrace",
            "wandering-capsule",
        ],
        silhouette_bias as usize,
    );
    let architecture_style = selected_token(
        &blueprint.architecture_style,
        &[
            "cloud-organic",
            "cycladic-white",
            "chinese-thatch",
            "chinese-red-wall",
            "jiangnan-white-wall",
            "american-modern",
            "coral-fantasy",
            "ancient-greek",
        ],
        (silhouette_bias >> 5) as usize,
    );
    let layout = selected_token(
        &blueprint.layout,
        &[
            "clustered",
            "courtyard",
            "vertical",
            "cantilevered",
            "terraced",
            "ring",
            "linear",
            "scattered",
        ],
        (silhouette_bias >> 11) as usize,
    );

    if location == TopiaLocation::Exterior {
        scene
            .objects
            .retain(|object| object.layer != TopiaObjectLayer::Structure);
        scene.objects.extend(exterior_structure(
            habitat_form,
            architecture_style,
            concept,
        ));
    } else if location == TopiaLocation::Interior {
        apply_interior_form(
            &mut scene,
            habitat_form,
            architecture_style,
            layout,
            silhouette_bias,
            concept,
        );
    } else {
        apply_layout(&mut scene, location, layout, silhouette_bias);
    }
    for (index, object) in scene
        .objects
        .iter_mut()
        .filter(|object| object.layer == TopiaObjectLayer::Structure)
        .enumerate()
    {
        if let Some(scale) = &mut object.scale {
            let variation = ((silhouette_bias.rotate_left(index as u32) % 17) as f64 - 8.0) / 100.0;
            scale[1] = (scale[1] * (1.0 + variation)).clamp(0.1, 4.0);
        }
    }

    apply_spatial_blueprint(&mut scene, location, &blueprint, concept);
    let feature_limit = if location == TopiaLocation::Interior {
        1
    } else {
        (2.0 + density * 4.0).round() as usize
    };
    for (index, feature) in blueprint
        .features
        .into_iter()
        .take(feature_limit)
        .enumerate()
    {
        let Some(prefab) = feature_prefab(&feature.kind) else {
            continue;
        };
        if location == TopiaLocation::Interior
            && !matches!(prefab, TopiaPrefab::Plant | TopiaPrefab::Lantern)
        {
            continue;
        }
        let angle = index as f64 * 2.399_963 + (silhouette_bias % 100) as f64 / 100.0;
        let radius = 1.25 + index as f64 * 0.42;
        let emphasis = if feature.emphasis.is_finite() {
            feature.emphasis.clamp(0.0, 1.0)
        } else {
            default_emphasis()
        };
        let base_y = if prefab == TopiaPrefab::Cloud {
            0.8
        } else {
            0.2
        };
        let mut position = feature_position(layout, index, angle, radius, base_y, 0.0);
        // Emphasis controls size, never unsupported elevation.
        position[1] = base_y;
        scene.objects.push(TopiaObjectConfig {
            id: format!("blueprint-{:?}-{index}", location).to_ascii_lowercase(),
            prefab,
            layer: TopiaObjectLayer::Decoration,
            position,
            rotation: Some([0.0, -angle, 0.0]),
            scale: Some([0.55 + emphasis * 0.45; 3]),
            colors: vec![feature
                .color
                .as_ref()
                .and_then(parse_flexible_color)
                .unwrap_or(concept.palette[index % concept.palette.len()])],
            params: HashMap::new(),
            anchor_id: None,
            task_id: None,
            memory_ids: vec![],
            animation: feature.animation.filter(|a| {
                a != "float" || matches!(prefab, TopiaPrefab::Cloud | TopiaPrefab::WateringOrb)
            }),
        });
    }
    if location == TopiaLocation::Interior {
        enforce_residential_room(&mut scene, concept);
    }
    normalize_scene_contract(&mut scene, location)?;
    Ok(scene)
}

pub fn parse_design_brief(text: &str) -> Result<Value, String> {
    let brief = extract_json(text)?;
    if !brief
        .get("keywords")
        .and_then(Value::as_array)
        .is_some_and(|v| {
            (4..=8).contains(&v.len())
                && v.iter().all(|v| {
                    v.as_str()
                        .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 60)
                })
        })
        || ["exterior", "interior", "garden"].iter().any(|k| {
            !brief
                .get(k)
                .and_then(Value::as_str)
                .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 500)
        })
    {
        return Err("design brief needs concrete keywords and three spatial designs".into());
    }
    Ok(brief)
}

pub fn parse_souvenir_design(text: &str) -> Result<Value, String> {
    let v = extract_json(text)?;
    let name = v["name"]
        .as_str()
        .filter(|s| super::valid_text(s, 28))
        .ok_or("invalid souvenir name")?;
    let description = v["description"]
        .as_str()
        .filter(|s| super::valid_text(s, 180))
        .ok_or("invalid souvenir description")?;
    let kind = v["modelKind"]
        .as_str()
        .filter(|s| {
            matches!(
                *s,
                "moon-rabbit-doll"
                    | "constellation-badge"
                    | "firefly-bottle"
                    | "winged-book"
                    | "star-compass"
                    | "sprout-lantern"
                    | "cloud-whale"
                    | "planet-teacup"
                    | "echo-shell"
                    | "clockwork-bird"
                    | "aurora-key"
                    | "dream-camera"
                    | "flaming-pan-sculpture"
                    | "mnn-engine-core"
            )
        })
        .ok_or("unsupported souvenir model")?;
    let palette: Vec<_> = v["colors"]
        .as_array()
        .into_iter()
        .flatten()
        .take(3)
        .filter_map(parse_flexible_color)
        .collect();
    if palette.len() != 3 {
        return Err("souvenir needs three valid colors".into());
    }
    let ornaments: Vec<_> = v["ornaments"]
        .as_array()
        .into_iter()
        .flatten()
        .take(3)
        .filter_map(Value::as_str)
        .filter(|s| matches!(*s, "star" | "gem" | "leaf" | "ring" | "ribbon"))
        .collect();
    Ok(
        serde_json::json!({"name":name,"description":description,"emoji":v["emoji"].as_str().filter(|s|super::valid_text(s,8)).unwrap_or("✨"),
        "modelKind":kind,"colors":palette,"ornaments":ornaments,
        "material":v["material"].as_str().filter(|s|matches!(*s,"wood"|"porcelain"|"paper"|"metal"|"glass")).unwrap_or("porcelain"),
        "preferredLocation":v["preferredLocation"].as_str().filter(|s|matches!(*s,"exterior"|"interior"|"garden")).unwrap_or("interior")}),
    )
}

pub fn parse_detail_plan(text: &str) -> Result<Value, String> {
    let value = extract_json(text)?;
    let details = value
        .get("details")
        .and_then(Value::as_array)
        .ok_or("detail plan needs details array")?;
    if details.is_empty() || details.len() > 9 {
        return Err("detail plan needs one to nine bounded additions".into());
    }
    for detail in details {
        if !matches!(
            detail.get("location").and_then(Value::as_str),
            Some("exterior" | "interior" | "garden")
        ) || !matches!(
            detail.get("kind").and_then(Value::as_str),
            Some("pergola" | "planter-box" | "stone-path" | "balustrade" | "book-nook")
        ) || !detail
            .get("position")
            .and_then(Value::as_array)
            .is_some_and(|a| a.len() == 2 && a.iter().all(|v| v.as_f64().is_some()))
        {
            return Err(
                "detail plan needs allowlisted kind, location and numeric [x,z] position".into(),
            );
        }
    }
    Ok(value)
}

pub fn apply_detail_plan(world: &mut super::TopiaWorldConfig, plan: &Value) -> Result<(), String> {
    let mut counts = [0usize; 3];
    let colors = world.profile.accent_colors.clone();
    for (i, detail) in plan["details"]
        .as_array()
        .ok_or("missing detail array")?
        .iter()
        .enumerate()
    {
        let location = match detail["location"].as_str() {
            Some("exterior") => TopiaLocation::Exterior,
            Some("interior") => TopiaLocation::Interior,
            _ => TopiaLocation::Garden,
        };
        let index = match location {
            TopiaLocation::Exterior => 0,
            TopiaLocation::Interior => 1,
            TopiaLocation::Garden => 2,
        };
        let scene = super::scene_mut(world, location);
        if counts[index]
            >= if location == TopiaLocation::Interior {
                2
            } else {
                3
            }
            || scene.objects.len() >= 32
        {
            continue;
        }
        let kind = detail["kind"].as_str().ok_or("missing craft kind")?;
        if location == TopiaLocation::Interior && !matches!(kind, "book-nook" | "planter-box") {
            continue;
        }
        let p = detail["position"]
            .as_array()
            .ok_or("missing craft position")?;
        let mut object = structure_object(
            &format!("crafted-detail-{i}"),
            TopiaPrefab::Block,
            [
                bounded(p[0].as_f64().unwrap_or(0.0), -3.8, 3.8, 0.0),
                0.2,
                bounded(p[1].as_f64().unwrap_or(0.0), -3.0, 3.0, 0.0),
            ],
            [bounded(detail["scale"].as_f64().unwrap_or(0.9), 0.55, 1.25, 0.9); 3],
            colors.to_vec(),
        );
        object
            .params
            .insert("detailKind".into(), Value::String(kind.into()));
        object.rotation = Some([
            0.0,
            bounded(detail["rotation"].as_f64().unwrap_or(0.0), -3.2, 3.2, 0.0),
            0.0,
        ]);
        if location == TopiaLocation::Interior {
            // Accents stay at the perimeter; never take over the living/working aisle.
            object.position[0] = if p[0].as_f64().unwrap_or(1.0) < 0.0 {
                -2.65
            } else {
                2.65
            };
            object.position[2] = 1.65;
            object.scale = Some([0.55; 3]);
        }
        scene.objects.push(object);
        counts[index] += 1;
    }
    Ok(())
}

/// Palette-independent, ID-independent structural signatures for novelty checks.
pub fn geometry_signature(scene: &TopiaSceneConfig) -> Vec<String> {
    let mut tokens: Vec<_> = scene
        .objects
        .iter()
        .filter(|o| o.layer == TopiaObjectLayer::Structure || o.prefab == TopiaPrefab::CropPlot)
        .map(|o| {
            let quantize = |v: [f64; 3]| v.map(|v| (v * 2.0).round() as i32);
            let params: std::collections::BTreeMap<_, _> = o
                .params
                .iter()
                .filter(|(k, _)| {
                    matches!(
                        k.as_str(),
                        "shape" | "width" | "height" | "depth" | "radius"
                    )
                })
                .collect();
            format!(
                "{:?}:{:?}:{:?}:{:?}:{}",
                o.prefab,
                quantize(o.position),
                quantize(o.scale.unwrap_or([1.0; 3])),
                quantize(o.rotation.unwrap_or([0.0; 3])),
                serde_json::to_string(&params).unwrap_or_default()
            )
        })
        .collect();
    tokens.sort();
    tokens
}

pub fn spatial_summary(scene: &TopiaSceneConfig) -> Value {
    let objects: Vec<_> = scene
        .objects
        .iter()
        .filter(|o| o.layer == TopiaObjectLayer::Structure)
        .filter(|o| {
            matches!(
                o.prefab,
                TopiaPrefab::FloatingIsland
                    | TopiaPrefab::RoomShell
                    | TopiaPrefab::Bed
                    | TopiaPrefab::Desk
                    | TopiaPrefab::Shelf
            ) || o.id.starts_with("designed-mass-")
                || o.id.starts_with("garden-bed-pad-")
        })
        .take(9)
        .map(|o| {
            serde_json::json!({
                "kind": o.prefab, "p": o.position.map(|v| (v * 2.0).round() / 2.0),
                "s": o.scale, "shape": o.params.get("shape"),
            })
        })
        .collect();
    serde_json::json!({"objects": objects})
}

pub fn compile_novel_blueprint(
    text: &str,
    location: TopiaLocation,
    concept: &TopiaGenerationConcept,
    recent: &[TopiaSceneConfig],
) -> Result<TopiaSceneConfig, String> {
    let v = extract_json(text)?;
    let field = match location {
        TopiaLocation::Exterior => "massing",
        TopiaLocation::Interior => "furnishings",
        TopiaLocation::Garden => "plots",
    };
    if !v
        .get(field)
        .and_then(Value::as_array)
        .is_some_and(|v| v.len() >= 3)
    {
        let keys = v
            .as_object()
            .map(|o| o.keys().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        return Err(format!("{field} must specify at least three concrete geometry/placement entries; a template and colors alone cannot build a distinct scene. Received keys: {}", keys.join(",")));
    }
    let scene = compile_blueprint(text, location, concept)?;
    let signature = geometry_signature(&scene);
    for prior in recent {
        let old = geometry_signature(prior);
        let overlap = signature.iter().filter(|t| old.contains(t)).count();
        if overlap * 100 >= signature.len().max(old.len()) * 85 {
            return Err("geometry repeats a recent scene: change island outline/massing, room functional zones, or crop topology; changing palette is not a repair".into());
        }
    }
    Ok(scene)
}

#[derive(Deserialize)]
struct IterationPlan {
    additions: Vec<IterationAddition>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IterationAddition {
    location: TopiaLocation,
    kind: String,
    #[serde(default)]
    color: Option<Value>,
    #[serde(default)]
    memory_ids: Vec<String>,
    #[serde(default)]
    task_id: Option<String>,
}

pub fn apply_iteration(
    text: &str,
    current: &super::TopiaWorldConfig,
    input: &super::TopiaGenerationInput,
) -> Result<super::TopiaWorldConfig, String> {
    use std::hash::{Hash, Hasher};
    let plan: IterationPlan =
        serde_json::from_value(extract_json(text)?).map_err(|e| e.to_string())?;
    if plan.additions.len() > 6 {
        return Err("iteration has too many additions".into());
    }
    let mut world = current.clone();
    for addition in plan.additions {
        if addition
            .memory_ids
            .iter()
            .any(|id| !input.context.memories.iter().any(|m| &m.id == id))
            || addition
                .task_id
                .as_ref()
                .is_some_and(|id| !input.context.quests.iter().any(|q| &q.id == id))
        {
            return Err("iteration invented personal relation IDs".into());
        }
        if addition.memory_ids.is_empty() && addition.task_id.is_none() {
            continue;
        }
        if [
            &world.scenes.exterior,
            &world.scenes.interior,
            &world.scenes.garden,
        ]
        .iter()
        .any(|scene| {
            scene.objects.iter().any(|o| {
                (!addition.memory_ids.is_empty()
                    && addition
                        .memory_ids
                        .iter()
                        .all(|id| o.memory_ids.contains(id)))
                    || (addition.task_id.is_some() && o.task_id == addition.task_id)
            })
        }) {
            continue;
        }
        let scene = super::scene_mut(&mut world, addition.location);
        if scene.objects.len() >= 36 || scene.landmarks.len() >= 8 {
            continue;
        }
        if scene.objects.iter().any(|o| {
            !addition.memory_ids.is_empty()
                && addition
                    .memory_ids
                    .iter()
                    .all(|id| o.memory_ids.contains(id))
                || addition.task_id.is_some() && o.task_id == addition.task_id
        }) {
            continue;
        }
        let prefab = if addition.memory_ids.is_empty() {
            TopiaPrefab::CropPlot
        } else {
            feature_prefab(&addition.kind).ok_or("unsupported symbolic iteration feature")?
        };
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        addition.memory_ids.hash(&mut hash);
        addition.task_id.hash(&mut hash);
        let id = format!("evolution-{:x}", hash.finish());
        let anchor = format!("{id}-anchor");
        let i = scene.objects.len() % 6;
        scene.objects.push(TopiaObjectConfig {
            id: id.clone(),
            prefab,
            layer: if addition.memory_ids.is_empty() {
                TopiaObjectLayer::Crop
            } else {
                TopiaObjectLayer::Souvenir
            },
            position: [-2.0 + i as f64 * 0.65, 0.25, 1.5],
            rotation: None,
            scale: Some([0.65; 3]),
            colors: vec![addition
                .color
                .as_ref()
                .and_then(parse_flexible_color)
                .unwrap_or(current.profile.accent_colors[0])],
            params: HashMap::new(),
            anchor_id: Some(anchor.clone()),
            task_id: addition.task_id.clone(),
            memory_ids: addition.memory_ids.clone(),
            animation: if addition.memory_ids.is_empty() {
                None
            } else {
                Some("sparkle".into())
            },
        });
        let title = input
            .context
            .memories
            .iter()
            .find(|m| addition.memory_ids.contains(&m.id))
            .map(|m| m.title.as_str())
            .or_else(|| {
                input
                    .context
                    .quests
                    .iter()
                    .find(|q| Some(&q.id) == addition.task_id.as_ref())
                    .map(|q| q.title.as_str())
            })
            .unwrap_or("新的收藏");
        scene.landmarks.push(super::TopiaLandmark {
            id,
            anchor_id: anchor,
            location: addition.location,
            emoji: "✨".into(),
            label: title.chars().take(36).collect(),
            eyebrow: "旅程的纪念".into(),
            description: "最近的经历在这里留下了一个象征。".into(),
            fallback_placement: super::TopiaPlacement {
                left: "50%".into(),
                top: "50%".into(),
            },
            memory_ids: addition.memory_ids,
            task_ids: addition.task_id.into_iter().collect(),
            person_ids: vec![],
        });
    }
    fit_crop_slots(&mut world.scenes.garden);
    world.revision = current.revision.saturating_add(1);
    super::validate_world(&world)?;
    Ok(world)
}

pub fn fallback_summary(stage: &str, error: &str) -> String {
    format!(
        "stage={stage} recovery=local-compile kind={:?} error={error}",
        classify_failure(error)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn concept() -> TopiaGenerationConcept {
        super::super::parse_concept(r##"{"title":"测试","archetype":"具体结构","palette":["#88ccff","#bb7755","#ccaa66"]}"##).unwrap()
    }

    #[test]
    fn cloud_three_axis_position_keeps_footprint_but_not_floating_height() {
        let scene = compile_blueprint(
            r#"{"massing":[{"kind":"block","position":[1,100,-1],"size":[1,2,1]}]}"#,
            TopiaLocation::Exterior,
            &concept(),
        )
        .unwrap();
        let mass = scene
            .objects
            .iter()
            .find(|o| o.id == "designed-mass-0")
            .unwrap();
        assert_eq!(mass.position, [1.0, 1.2, -1.0]);
        assert!(compile_blueprint(
            r#"{"massing":[{"kind":"block","position":[1,2,3,4],"size":[1,2,1]}]}"#,
            TopiaLocation::Exterior,
            &concept()
        )
        .is_err());
    }

    #[test]
    fn room_is_a_residence_even_if_blueprint_omits_usable_furniture() {
        let scene = compile_blueprint(
            r#"{"roomShape":"cloud-ring","furnishings":[],"features":[{"kind":"observatory"}]}"#,
            TopiaLocation::Interior,
            &concept(),
        )
        .unwrap();
        for kind in [
            TopiaPrefab::Bed,
            TopiaPrefab::Desk,
            TopiaPrefab::Chair,
            TopiaPrefab::Shelf,
        ] {
            assert!(scene.objects.iter().any(|o| o.prefab == kind
                && o.layer == TopiaObjectLayer::Structure
                && o.params.get("detailKind").is_none()));
        }
        let shell = scene
            .objects
            .iter()
            .find(|o| o.prefab == TopiaPrefab::RoomShell)
            .unwrap();
        assert_eq!(shell.params["shape"], "rectangular");
        assert_eq!(shell.params["residential"], true);
        let bed = scene
            .objects
            .iter()
            .find(|o| o.prefab == TopiaPrefab::Bed && o.layer == TopiaObjectLayer::Structure)
            .unwrap();
        let desk = scene
            .objects
            .iter()
            .find(|o| o.prefab == TopiaPrefab::Desk && o.layer == TopiaObjectLayer::Structure)
            .unwrap();
        assert!(bed.position[0] * desk.position[0] < 0.0);
        assert!(scene.objects.iter().any(|o| o.id == "room-entry-door"));
        assert!(
            scene
                .objects
                .iter()
                .any(|o| o.params.get("detailKind").and_then(Value::as_str)
                    == Some("display-cabinet"))
        );
    }

    #[test]
    fn interior_detail_pass_cannot_turn_room_into_outdoor_exhibition() {
        let mut world = super::super::mock_world().unwrap();
        let plan=parse_detail_plan(r#"{"details":[{"location":"interior","kind":"pergola","position":[0,0]},{"location":"interior","kind":"book-nook","position":[0,0]},{"location":"interior","kind":"planter-box","position":[0,0]},{"location":"interior","kind":"book-nook","position":[0,0]}]}"#).unwrap();
        apply_detail_plan(&mut world, &plan).unwrap();
        let details: Vec<_> = world
            .scenes
            .interior
            .objects
            .iter()
            .filter(|o| o.id.starts_with("crafted-detail-"))
            .collect();
        assert_eq!(details.len(), 2);
        assert!(details.iter().all(|o| o.params["detailKind"] != "pergola"));
    }

    #[test]
    fn same_palette_can_produce_different_geometry_in_all_views() {
        for (location, a, b) in [
            (
                TopiaLocation::Exterior,
                r#"{"islandShape":"crescent","massing":[{"kind":"block","position":[-1,0],"size":[1,2,1]},{"kind":"cylinder","position":[1,0],"size":[1,1,1]},{"kind":"cone","position":[0,-1],"size":[1,2,1]}]}"#,
                r#"{"islandShape":"split","massing":[{"kind":"block","position":[0,1],"size":[2,1,1]},{"kind":"block","position":[-1,-1],"size":[1,3,1]},{"kind":"cloud","position":[1,-1],"size":[1,1,1]}]}"#,
            ),
            (
                TopiaLocation::Interior,
                r#"{"roomShape":"rectangular","furnishings":[{"kind":"bed","position":[-1,1]},{"kind":"desk","position":[1,-1]},{"kind":"shelf","position":[2,0]}]}"#,
                r#"{"roomShape":"cantilever-loft","roomScale":[1.15,0.85],"furnishings":[{"kind":"bed","position":[1,0]},{"kind":"desk","position":[-1,1]},{"kind":"shelf","position":[-2,-1]}]}"#,
            ),
            (
                TopiaLocation::Garden,
                r#"{"layout":"ring","plots":[[-2,0],[0,2],[2,0]]}"#,
                r#"{"layout":"terraced","plots":[[-2,-1],[0,0],[2,1]]}"#,
            ),
        ] {
            let first = compile_novel_blueprint(a, location, &concept(), &[]).unwrap();
            let second =
                compile_novel_blueprint(b, location, &concept(), &[first.clone()]).unwrap();
            assert_ne!(geometry_signature(&first), geometry_signature(&second));
            assert!(
                compile_novel_blueprint(a, location, &concept(), &[first]).is_err(),
                "repetition must request a geometric repair"
            );
        }
    }

    #[test]
    fn high_emphasis_does_not_levitate_grounded_features() {
        let scene = compile_blueprint(r#"{"layout":"vertical","features":[{"kind":"plant","animation":"float","emphasis":1},{"kind":"crystal","animation":"float","emphasis":1}]}"#, TopiaLocation::Exterior, &concept()).unwrap();
        for object in scene
            .objects
            .iter()
            .filter(|o| o.id.starts_with("blueprint-"))
        {
            assert_eq!(object.position[1], 0.2);
            assert!(object.animation.is_none());
        }
    }

    #[test]
    fn transferred_crops_follow_new_supported_beds() {
        let mut scene = compile_blueprint(
            r#"{"layout":"terraced","plots":[[-2,-1],[0,0],[2,1]]}"#,
            TopiaLocation::Garden,
            &concept(),
        )
        .unwrap();
        for crop in scene
            .objects
            .iter_mut()
            .filter(|o| o.prefab == TopiaPrefab::CropPlot)
        {
            crop.position = [7.0, 6.0, 7.0];
        }
        fit_crop_slots(&mut scene);
        for crop in scene
            .objects
            .iter()
            .filter(|o| o.prefab == TopiaPrefab::CropPlot)
        {
            assert!(scene
                .objects
                .iter()
                .any(|pad| pad.id.starts_with("garden-bed-pad-")
                    && pad.position[0] == crop.position[0]
                    && pad.position[2] == crop.position[2]
                    && crop.position[1] > pad.position[1]));
        }
    }

    #[test]
    fn requests_share_a_bounded_budget() {
        assert_eq!(request_budget("concept", 20_000).unwrap(), 12_000);
        assert_eq!(request_budget("garden-blueprint", 750).unwrap(), 750);
        assert!(request_budget("concept-repair-1", 200).is_err());
        assert_eq!(GENERATION_BUDGET_MS, 40_000);
    }

    #[test]
    fn detail_pass_preserves_core_geometry_and_bounds_additions() {
        let mut world = super::super::mock_world().unwrap();
        let original = world.scenes.exterior.objects.clone();
        let plan=parse_detail_plan(r#"{"details":[{"location":"exterior","kind":"pergola","position":[99,-99],"scale":9}]}"#).unwrap();
        apply_detail_plan(&mut world, &plan).unwrap();
        assert_eq!(
            serde_json::to_value(&world.scenes.exterior.objects[..original.len()]).unwrap(),
            serde_json::to_value(original).unwrap()
        );
        let object = world.scenes.exterior.objects.last().unwrap();
        assert_eq!(object.position, [3.8, 0.2, -3.0]);
        assert_eq!(object.scale, Some([1.25; 3]));
        assert!(parse_detail_plan(
            r#"{"details":[{"location":"sky","kind":"code","position":[0,0]}]}"#
        )
        .is_err());
    }

    #[test]
    fn souvenir_design_keeps_allowed_geometry_and_normalizes_colors() {
        let design=parse_souvenir_design(r##"{"name":"风芽灯","description":"一起照料的绿意变成了温柔的小灯。","modelKind":"sprout-lantern","colors":["#aabbcc",123,[1,2,3]],"ornaments":["leaf","code","gem"],"material":"wood"}"##).unwrap();
        assert_eq!(design["ornaments"], serde_json::json!(["leaf", "gem"]));
        assert_eq!(design["colors"][0], 0xaabbcc);
        assert!(parse_souvenir_design(r#"{"modelKind":"javascript"}"#).is_err());
    }

    #[test]
    fn many_portable_crops_get_distinct_supported_subplots() {
        let mut scene = super::super::mock_world().unwrap().scenes.garden;
        let source = scene
            .objects
            .iter()
            .find(|o| o.prefab == TopiaPrefab::CropPlot)
            .unwrap()
            .clone();
        scene.objects.retain(|o| o.prefab != TopiaPrefab::CropPlot);
        for i in 0..8 {
            let mut crop = source.clone();
            crop.id = format!("test-crop-{i}");
            scene.objects.push(crop);
        }
        scene.objects.push(with_params(
            structure_object(
                "garden-bed-pad-0",
                TopiaPrefab::Block,
                [0.0, 0.3, 0.0],
                [1.0; 3],
                vec![0x76513f],
            ),
            &[("height", 0.2)],
        ));
        fit_crop_slots(&mut scene);
        let crops: Vec<_> = scene
            .objects
            .iter()
            .filter(|o| o.prefab == TopiaPrefab::CropPlot)
            .collect();
        let positions: std::collections::HashSet<_> =
            crops.iter().map(|o| format!("{:?}", o.position)).collect();
        assert_eq!(positions.len(), 8);
        assert!(crops
            .iter()
            .all(|o| o.position[1] < 0.6 && o.scale.unwrap()[0] <= 0.3 && o.animation.is_none()));
    }

    #[test]
    fn incremental_plan_cannot_rewrite_architecture_or_invent_relations() {
        let current = super::super::mock_world().unwrap();
        let input = super::super::iteration_input(
            &super::super::initial_studio().unwrap(),
            super::super::TopiaRuntimeContext::default(),
        );
        let next = apply_iteration(r#"{"additions":[]}"#, &current, &input).unwrap();
        assert_eq!(
            serde_json::to_value(&next.scenes).unwrap(),
            serde_json::to_value(&current.scenes).unwrap()
        );
        assert_eq!(next.revision, current.revision + 1);
        assert!(apply_iteration(
            r#"{"additions":[{"location":"interior","kind":"crystal","memoryIds":["invented"]}]}"#,
            &current,
            &input
        )
        .is_err());
    }

    #[test]
    fn classifies_timeout_for_immediate_local_compilation() {
        assert_eq!(
            classify_failure("cloud completion failed: 请求超时"),
            FailureKind::Transport
        );
    }

    #[test]
    fn keeps_scene_outputs_bounded() {
        assert!(completion_budget("concept") < completion_budget("exterior"));
        assert!(completion_budget("exterior") <= 4_096);
    }

    #[test]
    fn compiles_a_small_blueprint_into_a_valid_scene_contract() {
        let concept = super::super::fallback_concept(&super::super::TopiaGenerationInput {
            profile: super::super::TopiaUserProfileInput {
                display_name: Some("测试".into()),
                summary: "喜欢安静的漂浮空间".into(),
                traits: vec![],
                experiences: vec![],
                preferences: vec![],
                imagery: vec![],
                sensations: vec![],
                style_preferences: vec![],
            },
            context: super::super::TopiaRuntimeContext::default(),
        });
        let scene = compile_blueprint(
            r##"{"density":0.6,"cameraYaw":9,"silhouette":"asymmetric folded arc","features":[{"kind":"crystal","color":"#88ccff","animation":"float"},{"kind":"lantern","emphasis":0.8}]}"##,
            TopiaLocation::Exterior,
            &concept,
        )
        .expect("blueprint should compile");
        super::super::validate_scene(&scene, TopiaLocation::Exterior)
            .expect("compiled scene should satisfy runtime contract");
        assert_eq!(scene.camera.yaw, 3.2);
        assert!(scene.objects.iter().any(|object| {
            object.id.starts_with("blueprint-exterior") && object.prefab == TopiaPrefab::Crystal
        }));
    }
}
use super::{
    extract_json, fallback_scene, normalize_scene_contract, parse_flexible_color,
    TopiaGenerationConcept, TopiaLocation, TopiaObjectConfig, TopiaObjectLayer, TopiaPrefab,
    TopiaSceneConfig,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
