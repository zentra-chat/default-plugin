<script lang="ts">
	import { onMount } from 'svelte';
	import { getSDK } from '@zentra/plugin-sdk/runtime';

	const sdk = getSDK();
	const { activeChannel, activeChannelMessages } = sdk.stores;

	interface ForumMessage {
		id: string;
		channelId: string;
		authorId: string;
		content?: string | null;
		createdAt: string;
		replyToId?: string | null;
		updatedAt?: string;
		attachments?: Array<{
			id: string;
			filename: string;
			url: string;
			thumbnailUrl?: string;
			contentType?: string | null;
		}>;
		author?: {
			id: string;
			username: string;
			displayName?: string | null;
			avatarUrl?: string | null;
		};
	}

	interface ForumTopic {
		id: string;
		title: string;
		body: string;
		authorName: string;
		authorAvatar: string | null;
		createdAt: string;
		lastActivityAt: string;
		replyCount: number;
	}

	let fetchedMessages: ForumMessage[] = [];
	let loadingTopics = false;
	let selectedTopicId: string | null = null;
	let showTopicForm = false;
	let creatingTopic = false;
	let newTopicTitle = '';
	let newTopicBody = '';
	let replyBody = '';
	let postingReply = false;
	let sortBy: 'latest' | 'popular' = 'latest';
	let loadedChannelId = '';

	$: liveMessages = (($activeChannelMessages || []) as ForumMessage[]).filter(Boolean);
	$: allMessages = mergeMessages(fetchedMessages, liveMessages);
	$: topics = buildTopics(allMessages, sortBy);
	$: selectedTopic = selectedTopicId ? topics.find((topic) => topic.id === selectedTopicId) ?? null : null;
	$: selectedTopicRootMessage = selectedTopicId
		? allMessages.find((message) => message.id === selectedTopicId && !message.replyToId) ?? null
		: null;
	$: selectedTopicReplies = selectedTopicId
		? allMessages
				.filter((message) => message.replyToId === selectedTopicId)
				.sort((left, right) => toTimestamp(left.createdAt) - toTimestamp(right.createdAt))
		: [];

	$: if ($activeChannel?.id && $activeChannel.id !== loadedChannelId) {
		loadedChannelId = $activeChannel.id;
		selectedTopicId = null;
		showTopicForm = false;
		newTopicTitle = '';
		newTopicBody = '';
		replyBody = '';
		void loadChannelMessages($activeChannel.id);
	}

	onMount(() => {
		if ($activeChannel?.id) {
			loadedChannelId = $activeChannel.id;
			void loadChannelMessages($activeChannel.id);
		}
	});

	function mergeMessages(base: ForumMessage[], incoming: ForumMessage[]) {
		const byId = new Map<string, ForumMessage>();
		for (const message of base) {
			if (message?.id) byId.set(message.id, message);
		}
		for (const message of incoming) {
			if (message?.id) byId.set(message.id, message);
		}
		return Array.from(byId.values());
	}

	function buildTopics(messages: ForumMessage[], mode: 'latest' | 'popular'): ForumTopic[] {
		const topLevelMessages = messages.filter((message) => !message.replyToId);
		const repliesByTopic = new Map<string, ForumMessage[]>();

		for (const message of messages) {
			if (!message.replyToId) continue;
			if (!repliesByTopic.has(message.replyToId)) {
				repliesByTopic.set(message.replyToId, []);
			}
			repliesByTopic.get(message.replyToId)?.push(message);
		}

		const nextTopics = topLevelMessages.map((message) => {
			const { title, body } = extractTopicContent(message.content || '');
			const replies = repliesByTopic.get(message.id) || [];
			const lastActivityAt = replies.reduce((latest, reply) => {
				const replyTimestamp = toTimestamp(reply.updatedAt || reply.createdAt);
				return replyTimestamp > latest ? replyTimestamp : latest;
			}, toTimestamp(message.updatedAt || message.createdAt));

			return {
				id: message.id,
				title,
				body,
				authorName: message.author?.displayName || message.author?.username || 'Unknown user',
				authorAvatar: message.author?.avatarUrl || null,
				createdAt: message.createdAt,
				lastActivityAt: new Date(lastActivityAt).toISOString(),
				replyCount: replies.length
			};
		});

		nextTopics.sort((left, right) => {
			if (mode === 'popular') return right.replyCount - left.replyCount;
			return toTimestamp(right.lastActivityAt) - toTimestamp(left.lastActivityAt);
		});

		return nextTopics;
	}

	function extractTopicContent(content: string) {
		const trimmed = content.trim();
		if (!trimmed) {
			return { title: 'Untitled topic', body: '' };
		}

		const lines = trimmed.split(/\r?\n/);
		const title = lines[0]?.trim() || 'Untitled topic';
		const body = lines.slice(1).join('\n').trim();
		return { title, body };
	}

	function toTimestamp(value: string | undefined) {
		if (!value) return 0;
		const timestamp = Date.parse(value);
		return Number.isNaN(timestamp) ? 0 : timestamp;
	}

	function formatRelativeTime(value: string) {
		const timestamp = toTimestamp(value);
		if (!timestamp) return 'Unknown time';

		const diffMs = Date.now() - timestamp;
		const minute = 60 * 1000;
		const hour = 60 * minute;
		const day = 24 * hour;

		if (diffMs < minute) return 'Just now';
		if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
		if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))}h ago`;
		if (diffMs < day * 7) return `${Math.max(1, Math.floor(diffMs / day))}d ago`;
		return new Date(timestamp).toLocaleDateString();
	}

	async function loadChannelMessages(channelId: string) {
		loadingTopics = true;
		try {
			const messages = (await sdk.api.getMessages(channelId, { limit: 250 })) as ForumMessage[];
			fetchedMessages = Array.isArray(messages) ? messages : [];
		} catch (error) {
			console.error('Failed to load forum messages:', error);
			sdk.ui.addToast({ type: 'error', message: 'Failed to load forum topics' });
		} finally {
			loadingTopics = false;
		}
	}

	function openTopic(topicId: string) {
		selectedTopicId = topicId;
		replyBody = '';
	}

	function closeTopic() {
		selectedTopicId = null;
		replyBody = '';
	}

	async function createTopic() {
		if (!$activeChannel?.id || creatingTopic || !newTopicTitle.trim()) return;

		creatingTopic = true;
		try {
			const content = newTopicBody.trim()
				? `${newTopicTitle.trim()}\n\n${newTopicBody.trim()}`
				: newTopicTitle.trim();

			const message = (await sdk.api.sendMessage($activeChannel.id, { content })) as ForumMessage;
			sdk.ui.addMessage($activeChannel.id, message);
			fetchedMessages = mergeMessages(fetchedMessages, [message]);
			newTopicTitle = '';
			newTopicBody = '';
			showTopicForm = false;
			selectedTopicId = message.id;
		} catch (error) {
			console.error('Failed to create topic:', error);
			sdk.ui.addToast({ type: 'error', message: 'Failed to create topic' });
		} finally {
			creatingTopic = false;
		}
	}

	function formatMessageBody(content: string | null | undefined): string {
		if (!content) return '';
		const parts = content.trim().split(/\r?\n/);
		return parts.slice(1).join('\n').trim();
	}

	async function postReply() {
		if (!$activeChannel?.id || !selectedTopicId || !replyBody.trim() || postingReply) return;

		postingReply = true;
		try {
			const message = (await sdk.api.sendMessage($activeChannel.id, {
				content: replyBody.trim(),
				replyToId: selectedTopicId
			})) as ForumMessage;

			sdk.ui.addMessage($activeChannel.id, message);
			fetchedMessages = mergeMessages(fetchedMessages, [message]);
			replyBody = '';
		} catch (error) {
			console.error('Failed to post reply:', error);
			sdk.ui.addToast({ type: 'error', message: 'Failed to post reply' });
		} finally {
			postingReply = false;
		}
	}
</script>

<div class="flex-1 flex flex-col min-h-0">
	{#if selectedTopic && selectedTopicRootMessage}
		<div class="h-12 px-4 border-b border-border bg-background flex items-center gap-2 shrink-0">
			<button
				type="button"
				on:click={closeTopic}
				class="px-2 py-1 rounded border border-border bg-surface text-sm text-text-secondary hover:text-text-primary"
			>
				Back to topics
			</button>
			<h2 class="text-sm font-semibold text-text-primary truncate">{selectedTopic.title}</h2>
			<span class="ml-auto text-xs text-text-muted">{selectedTopic.replyCount} replies</span>
		</div>

		<div class="flex-1 overflow-y-auto p-4 space-y-3">
			<div class="rounded-lg border border-border bg-surface p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center gap-2 min-w-0">
						{#if selectedTopic.authorAvatar}
							<img src={selectedTopic.authorAvatar} alt={selectedTopic.authorName} class="w-8 h-8 rounded-full object-cover" />
						{:else}
							<div class="w-8 h-8 rounded-full border border-border bg-background"></div>
						{/if}
						<div class="min-w-0">
							<p class="text-sm font-semibold text-text-primary truncate">{selectedTopic.authorName}</p>
							<p class="text-xs text-text-muted">{formatRelativeTime(selectedTopic.createdAt)}</p>
						</div>
					</div>
					<span class="text-[11px] uppercase tracking-wide text-text-muted bg-background border border-border rounded px-2 py-1">
						Original post
					</span>
				</div>

				<h3 class="text-base font-semibold text-text-primary mt-3">{selectedTopic.title}</h3>
				{#if selectedTopic.body}
					<p class="text-sm text-text-secondary whitespace-pre-wrap break-words mt-2">{selectedTopic.body}</p>
				{/if}

				{#if selectedTopicRootMessage.attachments && selectedTopicRootMessage.attachments.length > 0}
					<div class="mt-3 space-y-2">
						{#each selectedTopicRootMessage.attachments as attachment (attachment.id)}
							{#if attachment.contentType?.startsWith('image/')}
								<a href={attachment.url} target="_blank" rel="noopener noreferrer" class="block rounded border border-border overflow-hidden bg-background">
									<img src={attachment.thumbnailUrl || attachment.url} alt={attachment.filename} class="w-full max-h-80 object-cover" loading="lazy" />
								</a>
							{:else}
								<a href={attachment.url} target="_blank" rel="noopener noreferrer" class="block rounded border border-border bg-background px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
									{attachment.filename}
								</a>
							{/if}
						{/each}
					</div>
				{/if}
			</div>

			<div class="px-1 pt-2">
				<p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Replies</p>
			</div>

			{#if selectedTopicReplies.length === 0}
				<div class="rounded-lg border border-border bg-background p-4 text-sm text-text-muted">
					No replies yet. Start the thread.
				</div>
			{:else}
				<div class="space-y-2">
					{#each selectedTopicReplies as reply (reply.id)}
						<div class="rounded-lg border border-border bg-background p-3">
							<div class="flex items-center justify-between gap-2 mb-1">
								<p class="text-sm font-medium text-text-primary truncate">
									{reply.author?.displayName || reply.author?.username || 'Unknown user'}
								</p>
								<p class="text-xs text-text-muted">{formatRelativeTime(reply.createdAt)}</p>
							</div>
							{#if reply.content}
								<p class="text-sm text-text-secondary whitespace-pre-wrap break-words">{reply.content}</p>
							{/if}

							{#if reply.attachments && reply.attachments.length > 0}
								<div class="mt-2 space-y-2">
									{#each reply.attachments as attachment (attachment.id)}
										{#if attachment.contentType?.startsWith('image/')}
											<a href={attachment.url} target="_blank" rel="noopener noreferrer" class="block rounded border border-border overflow-hidden">
												<img src={attachment.thumbnailUrl || attachment.url} alt={attachment.filename} class="w-full max-h-80 object-cover" loading="lazy" />
											</a>
										{:else}
											<a href={attachment.url} target="_blank" rel="noopener noreferrer" class="block rounded border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
												{attachment.filename}
											</a>
										{/if}
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="border-t border-border bg-background p-3 space-y-2">
			<textarea
				bind:value={replyBody}
				rows={3}
				placeholder="Write a reply"
				class="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
			></textarea>
			<div class="flex justify-end">
				<button
					type="button"
					on:click={postReply}
					disabled={postingReply || !replyBody.trim()}
					class="px-3 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-60"
				>
					{postingReply ? 'Posting...' : 'Post Reply'}
				</button>
			</div>
		</div>
	{:else}
		<div class="px-4 py-3 border-b border-border bg-surface space-y-3 shrink-0">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-text-primary">{$activeChannel?.name || 'Forum'}</h2>
					<p class="text-xs text-text-muted">Create topics and discuss them in threaded replies.</p>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						on:click={() => {
							sortBy = 'latest';
						}}
						class="px-2 py-1 rounded border text-xs {sortBy === 'latest'
							? 'border-primary text-primary bg-primary/10'
							: 'border-border text-text-muted bg-background'}"
					>
						Latest
					</button>
					<button
						type="button"
						on:click={() => {
							sortBy = 'popular';
						}}
						class="px-2 py-1 rounded border text-xs {sortBy === 'popular'
							? 'border-primary text-primary bg-primary/10'
							: 'border-border text-text-muted bg-background'}"
					>
						Popular
					</button>
					<button
						type="button"
						on:click={() => {
							showTopicForm = !showTopicForm;
						}}
						class="px-3 py-2 rounded bg-primary text-primary-foreground text-sm"
					>
						{showTopicForm ? 'Close' : 'New Topic'}
					</button>
				</div>
			</div>

			{#if showTopicForm}
				<div class="grid gap-2">
					<input
						bind:value={newTopicTitle}
						placeholder="Topic title"
						maxlength={200}
						class="w-full rounded border border-border bg-background px-3 py-2 text-sm"
					/>
					<textarea
						bind:value={newTopicBody}
						rows={4}
						placeholder="Topic details"
						maxlength={4000}
						class="w-full rounded border border-border bg-background px-3 py-2 text-sm"
					></textarea>
					<div class="flex justify-end">
						<button
							type="button"
							on:click={createTopic}
							disabled={creatingTopic || !newTopicTitle.trim()}
							class="px-3 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-60"
						>
							{creatingTopic ? 'Creating...' : 'Post Topic'}
						</button>
					</div>
				</div>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if loadingTopics}
				<div class="h-full flex items-center justify-center text-sm text-text-muted">
					Loading topics...
				</div>
			{:else if topics.length === 0}
				<div class="h-full flex items-center justify-center px-4 text-center text-sm text-text-muted">
					No topics yet. Start the first discussion.
				</div>
			{:else}
				<div class="divide-y divide-border">
					{#each topics as topic (topic.id)}
						<button
							type="button"
							on:click={() => openTopic(topic.id)}
							class="w-full px-4 py-3 text-left hover:bg-surface transition-colors"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1">
									<h3 class="text-sm font-semibold text-text-primary truncate">{topic.title}</h3>
									{#if topic.body}
										<p class="text-xs text-text-muted mt-1 line-clamp-2">{topic.body}</p>
									{/if}
									<div class="mt-2 flex items-center gap-3 text-xs text-text-muted">
										<span>{topic.authorName}</span>
										<span>{topic.replyCount} replies</span>
										<span>{formatRelativeTime(topic.lastActivityAt)}</span>
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
