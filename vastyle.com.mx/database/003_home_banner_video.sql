-- Add optional looping video support to homepage banners.
ALTER TABLE home_banners
  ADD COLUMN IF NOT EXISTS video_url VARCHAR(1200) NULL AFTER mobile_image_url;
