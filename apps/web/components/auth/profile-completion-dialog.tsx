'use client';

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { updateProfile } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useAuthContext } from "@/components/providers/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, db } from "@/lib/firebase/client";

const profileSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters."),
  photoURL: z
    .string()
    .url("Must be a valid URL")
    .or(z.literal(""))
    .optional()
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export const ProfileCompletionDialog = () => {
  const { user, refresh } = useAuthContext();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: "",
      photoURL: ""
    }
  });

  useEffect(() => {
    if (user && !user.profileComplete) {
      setOpen(true);
      reset({
        displayName: user.displayName ?? "",
        photoURL: user.photoURL ?? ""
      });
    } else {
      setOpen(false);
    }
  }, [reset, user]);

  if (!user) {
    return null;
  }

  const onSubmit = async (values: ProfileFormValues) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("You must be signed in to update your profile.");
      return;
    }

    try {
      await updateProfile(currentUser, {
        displayName: values.displayName,
        photoURL: values.photoURL || null
      });

      const userDocRef = user.docRef ?? doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        displayName: values.displayName,
        photoURL: values.photoURL || null,
        profileCompletedAt: serverTimestamp()
      });

      await refresh();
      toast.success("Profile updated!");
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Unable to update profile. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>
            Add a name and avatar so teammates know who&apos;s messaging. You can update this later in
            settings.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              placeholder="Jane Doe"
              autoFocus
              {...register("displayName")}
            />
            {errors.displayName && (
              <p className="text-sm text-destructive">{errors.displayName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="photoURL">Avatar URL</Label>
            <Input
              id="photoURL"
              placeholder="https://example.com/avatar.png"
              {...register("photoURL")}
            />
            <p className="text-xs text-muted-foreground">
              TODO: replace with in-app upload to Firebase Storage.
            </p>
            {errors.photoURL && <p className="text-sm text-destructive">{errors.photoURL.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              Save profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};


