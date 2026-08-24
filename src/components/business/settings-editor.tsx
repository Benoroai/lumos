"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { MediaPicker } from "./media-picker";
import {
  saveBusinessProfileAction,
  saveCatalogSettingsAction,
} from "@/lib/actions/business/settings";
import {
  OPTIONAL_FIELD_LABELS,
  OPTIONAL_ITEM_FIELDS,
} from "@/lib/business-templates";

export function SettingsEditor({
  profile,
  catalog,
  canManage,
  terminology,
}: {
  profile: {
    name: string;
    legalName: string;
    contactEmail: string;
    contactPhone: string;
    contactWhatsapp: string;
    websiteUrl: string;
    addressLine: string;
    city: string;
    logoPath: string | null;
    logoUrl: string | null;
  };
  catalog: {
    enabledItemFields: string[];
    aiTranslationEnabled: boolean;
    requireTranslationApproval: boolean;
  };
  canManage: boolean;
  terminology: { item: string; items: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [profileForm, setProfileForm] = useState(profile);
  const [catalogForm, setCatalogForm] = useState(catalog);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function saveProfile() {
    setError(null);
    setErrors({});
    startTransition(async () => {
      const result = await saveBusinessProfileAction(profileForm);
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        router.refresh();
      } else {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  function saveCatalog() {
    startTransition(async () => {
      const result = await saveCatalogSettingsAction({
        enabledItemFields: catalogForm.enabledItemFields,
        terminologyOverrides: {},
        aiTranslationEnabled: catalogForm.aiTranslationEnabled,
        requireTranslationApproval: catalogForm.requireTranslationApproval,
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Business profile</CardTitle>
            <CardDescription>
              Name, logo and contact details shown on your menu.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <MediaPicker
            label="Logo"
            kind="logo"
            value={profileForm.logoUrl}
            disabled={!canManage}
            onChange={(asset) =>
              setProfileForm((prev) => ({
                ...prev,
                logoPath: asset?.path ?? null,
                logoUrl: asset?.url ?? null,
              }))
            }
          />

          <FieldRow>
            <Field
              id="profile-name"
              label="Business name"
              required
              error={errors.name}
            >
              <Input
                id="profile-name"
                value={profileForm.name}
                disabled={!canManage}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </Field>
            <Field id="profile-legal" label="Legal name">
              <Input
                id="profile-legal"
                value={profileForm.legalName}
                disabled={!canManage}
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    legalName: e.target.value,
                  }))
                }
              />
            </Field>
            <Field
              id="profile-email"
              label="Contact email"
              error={errors.contactEmail}
            >
              <Input
                id="profile-email"
                type="email"
                value={profileForm.contactEmail}
                disabled={!canManage}
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    contactEmail: e.target.value,
                  }))
                }
              />
            </Field>
            <Field id="profile-phone" label="Phone">
              <Input
                id="profile-phone"
                value={profileForm.contactPhone}
                disabled={!canManage}
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    contactPhone: e.target.value,
                  }))
                }
              />
            </Field>
            <Field id="profile-whatsapp" label="WhatsApp">
              <Input
                id="profile-whatsapp"
                value={profileForm.contactWhatsapp}
                disabled={!canManage}
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    contactWhatsapp: e.target.value,
                  }))
                }
              />
            </Field>
            <Field
              id="profile-website"
              label="Website"
              error={errors.websiteUrl}
            >
              <Input
                id="profile-website"
                value={profileForm.websiteUrl}
                disabled={!canManage}
                placeholder="https://"
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    websiteUrl: e.target.value,
                  }))
                }
              />
            </Field>
            <Field id="profile-address" label="Address">
              <Input
                id="profile-address"
                value={profileForm.addressLine}
                disabled={!canManage}
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    addressLine: e.target.value,
                  }))
                }
              />
            </Field>
            <Field id="profile-city" label="City">
              <Input
                id="profile-city"
                value={profileForm.city}
                disabled={!canManage}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, city: e.target.value }))
                }
              />
            </Field>
          </FieldRow>

          <Button onClick={saveProfile} loading={pending} disabled={!canManage}>
            <Save /> Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Catalog fields</CardTitle>
            <CardDescription>
              Choose which optional fields appear when editing{" "}
              {terminology.items.toLowerCase()}. Turning one off hides it from
              the form — it never deletes data you have already entered.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {OPTIONAL_ITEM_FIELDS.map((field) => (
              <label
                key={field}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">
                  {OPTIONAL_FIELD_LABELS[field]}
                </span>
                <Switch
                  checked={catalogForm.enabledItemFields.includes(field)}
                  disabled={!canManage}
                  onCheckedChange={(value) =>
                    setCatalogForm((prev) => ({
                      ...prev,
                      enabledItemFields: value
                        ? [...prev.enabledItemFields, field]
                        : prev.enabledItemFields.filter((f) => f !== field),
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="space-y-2 border-t border-[var(--border)] pt-4">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  AI translation
                </span>
                <span className="block text-xs text-[var(--foreground-muted)]">
                  Allow one-click machine translation of catalog content.
                </span>
              </span>
              <Switch
                checked={catalogForm.aiTranslationEnabled}
                disabled={!canManage}
                onCheckedChange={(value) =>
                  setCatalogForm((prev) => ({
                    ...prev,
                    aiTranslationEnabled: value,
                  }))
                }
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Require translation approval
                </span>
                <span className="block text-xs text-[var(--foreground-muted)]">
                  Machine translations stay marked as AI generated until a
                  person approves them.
                </span>
              </span>
              <Switch
                checked={catalogForm.requireTranslationApproval}
                disabled={!canManage}
                onCheckedChange={(value) =>
                  setCatalogForm((prev) => ({
                    ...prev,
                    requireTranslationApproval: value,
                  }))
                }
              />
            </label>
          </div>

          <Button onClick={saveCatalog} loading={pending} disabled={!canManage}>
            <Save /> Save catalog settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
