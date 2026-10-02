import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import type { Person } from "../../models";
import { Icon } from "../ui/Icon";

const photoSource = (path: string) =>
  /^(?:data:|blob:|https?:)/.test(path) ? path : convertFileSrc(path);

export function Portrait({
  person,
  big = false,
}: {
  person: Person;
  big?: boolean;
}) {
  const photos = useMemo(
    () => [...new Set((person.photoPaths ?? []).filter(Boolean))],
    [person.photoPaths],
  );
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const [photoIndex, setPhotoIndex] = useState(0);
  const availablePhotos = photos.filter((path) => !failedPhotos.has(path));
  const visibleIndex = availablePhotos.length
    ? photoIndex % availablePhotos.length
    : 0;
  const currentPhoto = availablePhotos[visibleIndex];
  const canSwitch = big && availablePhotos.length > 1;

  useEffect(() => {
    setFailedPhotos(new Set());
    setPhotoIndex(0);
  }, [person.id, person.photoPaths]);

  useEffect(() => {
    if (!canSwitch) return;
    const timer = window.setInterval(
      () => setPhotoIndex((current) => current + 1),
      4_500,
    );
    return () => window.clearInterval(timer);
  }, [canSwitch, availablePhotos.length, person.id, photoIndex]);

  const contents = (
    <>
      {currentPhoto ? (
        <img
          className="portrait-photo"
          src={photoSource(currentPhoto)}
          alt={`${person.name}的照片 ${visibleIndex + 1}`}
          onError={() => {
            setFailedPhotos((current) => new Set(current).add(currentPhoto));
            setPhotoIndex(0);
          }}
        />
      ) : (
        <Icon name="UserRound" />
      )}
      <span className="portrait-badge">
        {canSwitch
          ? `${visibleIndex + 1}/${availablePhotos.length}`
          : person.name.slice(-1)}
      </span>
      {canSwitch && (
        <div className="portrait-dots" aria-hidden="true">
          {availablePhotos.map((path, index) => (
            <i className={index === visibleIndex ? "active" : ""} key={path} />
          ))}
        </div>
      )}
    </>
  );
  const className = `portrait ${person.tone}${big ? " big" : ""}${currentPhoto ? " has-photo" : ""}`;

  return canSwitch ? (
    <button
      type="button"
      className={className}
      data-photo-count={availablePhotos.length}
      aria-label={`${person.name}的照片，第 ${visibleIndex + 1} 张，共 ${availablePhotos.length} 张；点击切换`}
      onClick={() => setPhotoIndex((current) => current + 1)}
    >
      {contents}
    </button>
  ) : (
    <div className={className} data-photo-count={availablePhotos.length}>
      {contents}
    </div>
  );
}
