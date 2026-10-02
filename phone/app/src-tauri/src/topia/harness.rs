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
        "concept" | "review" => 2_048,
        stage if stage.contains("repair") => 3_072,
        stage if stage.contains("blueprint") => 2_048,
        _ => 4_096,
    }
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
    features: Vec<BlueprintFeature>,
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

pub fn compile_blueprint(
    value: &str,
    location: TopiaLocation,
    concept: &TopiaGenerationConcept,
) -> Result<TopiaSceneConfig, String> {
    let blueprint: SceneBlueprint =
        serde_json::from_value(extract_json(value)?).map_err(|error| error.to_string())?;
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

    let feature_limit = (2.0 + density * 4.0).round() as usize;
    for (index, feature) in blueprint
        .features
        .into_iter()
        .take(feature_limit)
        .enumerate()
    {
        let Some(prefab) = feature_prefab(&feature.kind) else {
            continue;
        };
        let angle = index as f64 * 2.399_963 + (silhouette_bias % 100) as f64 / 100.0;
        let radius = 1.25 + index as f64 * 0.42;
        let emphasis = if feature.emphasis.is_finite() {
            feature.emphasis.clamp(0.0, 1.0)
        } else {
            default_emphasis()
        };
        let base_y = match location {
            TopiaLocation::Exterior => 0.65,
            TopiaLocation::Interior => 0.15,
            TopiaLocation::Garden => 0.35,
        };
        scene.objects.push(TopiaObjectConfig {
            id: format!("blueprint-{:?}-{index}", location).to_ascii_lowercase(),
            prefab,
            layer: TopiaObjectLayer::Decoration,
            position: [
                angle.cos() * radius,
                base_y + emphasis,
                angle.sin() * radius,
            ],
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
            animation: feature.animation,
        });
    }
    normalize_scene_contract(&mut scene, location)?;
    Ok(scene)
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
