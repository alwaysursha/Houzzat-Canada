import type { AreaMonitorTransaction, ListingSegment } from "@prisma/client";
import type { AreaMonitorSettingsStore } from "@/lib/account/area-monitor-settings";
import type { PropertyMonitorSettingsStore } from "@/lib/account/property-monitor-settings";
import type { OwnedSavedSearchStore } from "@/lib/account/saved-search-ownership";
import { prisma } from "@/lib/prisma";

export function prismaPropertyMonitorSettingsStore(): PropertyMonitorSettingsStore {
  return {
    async updateEmailAlerts(input) {
      const result = await prisma.propertyMonitor.updateMany({
        where: {
          userId: input.userId,
          mlsNumber: input.mlsNumber,
        },
        data: { emailAlerts: input.emailAlerts },
      });
      if (result.count === 0) return null;
      return prisma.propertyMonitor.findFirst({
        where: {
          userId: input.userId,
          mlsNumber: input.mlsNumber,
        },
      });
    },
    async deleteOwned(input) {
      const result = await prisma.propertyMonitor.deleteMany({
        where: { userId: input.userId, mlsNumber: input.mlsNumber },
      });
      return result.count > 0;
    },
  };
}

export function prismaAreaMonitorSettingsStore(): AreaMonitorSettingsStore {
  return {
    async updateSettings(input) {
      const data: {
        emailAlerts?: boolean;
        notifyNew?: boolean;
        notifySold?: boolean;
      } = {};
      if (input.emailAlerts !== undefined) data.emailAlerts = input.emailAlerts;
      if (input.notifyNew !== undefined) data.notifyNew = input.notifyNew;
      if (input.notifySold !== undefined) data.notifySold = input.notifySold;

      const result = await prisma.areaMonitor.updateMany({
        where: {
          id: input.id,
          userId: input.userId,
        },
        data,
      });
      if (result.count === 0) return null;
      return prisma.areaMonitor.findFirst({
        where: {
          id: input.id,
          userId: input.userId,
        },
      });
    },
    async findOwnedSnapshot(input) {
      if (input.id) {
        return prisma.areaMonitor.findFirst({
          where: { id: input.id, userId: input.userId },
          select: {
            id: true,
            name: true,
            city: true,
            community: true,
            transactionType: true,
            segment: true,
          },
        });
      }
      if (!input.city) return null;
      const transactionType =
        input.transactionType === "SALE" ||
        input.transactionType === "LEASE" ||
        input.transactionType === "ALL"
          ? (input.transactionType as AreaMonitorTransaction)
          : undefined;
      const segment =
        input.segment === "RESIDENTIAL" ||
        input.segment === "COMMERCIAL" ||
        input.segment === "PRE_CONSTRUCTION"
          ? (input.segment as ListingSegment)
          : undefined;
      return prisma.areaMonitor.findFirst({
        where: {
          userId: input.userId,
          city: input.city,
          community: input.community || null,
          ...(transactionType ? { transactionType } : {}),
          ...(segment ? { segment } : {}),
        },
        select: {
          id: true,
          name: true,
          city: true,
          community: true,
          transactionType: true,
          segment: true,
        },
      });
    },
    async deleteOwned(input) {
      const result = await prisma.areaMonitor.deleteMany({
        where: { id: input.id, userId: input.userId },
      });
      return result.count > 0;
    },
  };
}

export function prismaOwnedSavedSearchStore(): OwnedSavedSearchStore {
  return {
    async findOwned(input) {
      return prisma.savedSearch.findFirst({
        where: { id: input.id, userId: input.userId },
        select: {
          id: true,
          userId: true,
          name: true,
          emailAlerts: true,
          smsAlerts: true,
          isPrimary: true,
          isHomepageActive: true,
          query: true,
        },
      });
    },
    async updateEmailAlerts(input) {
      const owned = await prisma.savedSearch.findFirst({
        where: { id: input.id, userId: input.userId },
        select: { id: true },
      });
      if (!owned) return null;
      return prisma.savedSearch.update({
        where: { id: input.id },
        data: { emailAlerts: input.emailAlerts },
        select: {
          id: true,
          userId: true,
          name: true,
          emailAlerts: true,
          smsAlerts: true,
          isPrimary: true,
          isHomepageActive: true,
        },
      });
    },
    async deleteOwned(input) {
      const result = await prisma.savedSearch.deleteMany({
        where: { id: input.id, userId: input.userId },
      });
      return result.count > 0;
    },
  };
}
