// Default plugin entry point. This is the built-in "Zentra Core" plugin that
// provides standard channel types (text, announcement, gallery, forum, voice)
// and the default header actions (pinned messages, member list).
//
// It registers everything through the same SDK API that third-party plugins use.
// The only difference is that this plugin is compiled into the main bundle
// instead of being loaded as a separate JS file at runtime.

import { definePlugin, type ZentraPluginSDK } from '@zentra/plugin-sdk';

export const register = definePlugin((sdk: ZentraPluginSDK) => {
	// Header actions - toolbar buttons that appear in channel headers
	sdk.registerHeaderAction({
		id: 'pinned',
		title: 'Pinned Messages',
		icon: 'pin',
		onClick: async (context) => {
			await context.togglePinnedDropdown();
		}
	});

	sdk.registerHeaderAction({
		id: 'members',
		title: 'Toggle Member List',
		icon: 'users',
		onClick: (context) => {
			context.toggleMemberSidebar();
		}
	});

	// Standard channel types - each one points to its own view component
	// via lazy import so we only load the code when actually needed.

	sdk.registerChannelType({
		id: 'text',
		icon: 'hash',
		viewComponent: () => import('./views/TextChannelView.svelte'),
		label: 'Text',
		description: 'Send messages, images, and files',
		showHash: true,
		headerActionIds: ['pinned', 'members']
	});

	sdk.registerChannelType({
		id: 'announcement',
		icon: 'megaphone',
		viewComponent: () => import('./views/AnnouncementChannelView.svelte'),
		label: 'Announcement',
		description: 'Important updates - only moderators can post',
		showHash: true,
		headerActionIds: ['pinned', 'members']
	});

	sdk.registerChannelType({
		id: 'gallery',
		icon: 'image',
		viewComponent: () => import('./views/GalleryChannelView.svelte'),
		label: 'Gallery',
		description: 'Share and browse images and media',
		showHash: false,
		headerActionIds: ['pinned', 'members']
	});

	sdk.registerChannelType({
		id: 'forum',
		icon: 'messages-square',
		viewComponent: () => import('./views/ForumChannelView.svelte'),
		label: 'Forum',
		description: 'Organized discussions with topics and threads',
		showHash: true,
		headerActionIds: ['pinned', 'members']
	});

	sdk.registerChannelType({
		id: 'voice',
		icon: 'volume-2',
		viewComponent: () => import('./views/VoiceChannelViewWrapper.svelte'),
		label: 'Voice',
		description: 'Hang out with real-time voice chat',
		showHash: false
	});
});
